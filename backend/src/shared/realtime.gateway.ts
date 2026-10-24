import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { env } from '../config/env';
import type { AuthUser } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Socket.IO channel (path /socket.io, namespace /realtime).
 * Client: io(`${API_ORIGIN}/realtime`, { auth: { token } }).
 * Rooms: user:{id} (notifications, messages, order updates), order:{id} (live tracking).
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: env().CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = String(socket.handshake.auth?.token ?? '');
    try {
      const user = await this.auth.authenticate(token);
      socket.data.user = user;
      await socket.join(`user:${user.id}`);
    } catch {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('order:subscribe')
  async subscribeOrder(@ConnectedSocket() socket: Socket, @MessageBody() body: { orderId?: string }) {
    const user = socket.data.user as AuthUser | undefined;
    if (!user || !body?.orderId) return { ok: false };
    const o = await this.prisma.order.findUnique({ where: { id: body.orderId } });
    const allowed =
      !!o &&
      (user.role === 'admin' ||
        o.buyerId === user.id ||
        (user.role === 'seller' && o.companyId === user.company?.id) ||
        (user.role === 'courier' && o.courierId === user.id));
    if (!allowed) return { ok: false };
    await socket.join(`order:${o.id}`);
    return { ok: true };
  }

  @SubscribeMessage('order:unsubscribe')
  async unsubscribeOrder(@ConnectedSocket() socket: Socket, @MessageBody() body: { orderId?: string }) {
    if (body?.orderId) await socket.leave(`order:${body.orderId}`);
    return { ok: true };
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toOrder(orderId: string, event: string, payload: unknown) {
    this.server?.to(`order:${orderId}`).emit(event, payload);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Prisma } from '@prisma/client';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { ApiError, notFound, validationError } from '../common/errors';
import { toNotification } from '../common/serialize';
import { iso } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../shared/notifications.service';
import { RealtimeGateway } from '../shared/realtime.gateway';

@ApiTags('notifications')
@Controller('notifications')
@Auth()
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
      this.prisma.notification.count({ where: { userId: u.id, read: false } }),
    ]);
    return { items: items.map(toNotification), unread };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, read: false }, data: { read: true } });
    return { ok: true };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { read: true } });
    return { ok: true };
  }
}

const CONVERSATION_INCLUDE = {
  participants: { include: { user: { include: { company: { select: { name: true } } } } } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.ConversationInclude;
type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

function present(c: ConversationRow, me: string) {
  const last = c.messages[0];
  const out: Record<string, unknown> = {
    id: c.id,
    participantIds: c.participants.map((p) => p.userId),
    participants: c.participants.map((p) => {
      const x: Record<string, unknown> = { id: p.userId, name: p.user.fullName, role: p.user.role };
      if (p.user.avatar) x.avatar = p.user.avatar;
      const companyName = p.user.company?.name ?? p.user.organization;
      if (companyName) x.companyName = companyName;
      return x;
    }),
    unread: c.participants.find((p) => p.userId === me)?.unread ?? 0,
    updatedAt: iso(c.updatedAt),
  };
  if (c.productId) out.productId = c.productId;
  if (c.productName) out.productName = c.productName;
  if (last) out.lastMessage = { text: last.text, senderId: last.senderId, at: iso(last.createdAt) };
  return out;
}

const toMessage = (m: { id: string; conversationId: string; senderId: string; text: string; createdAt: Date }) => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  text: m.text,
  createdAt: iso(m.createdAt),
});

@ApiTags('conversations')
@Controller('conversations')
@Auth()
export class ConversationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async load(id: string, me: string) {
    const c = await this.prisma.conversation.findFirst({ where: { id, participants: { some: { userId: me } } }, include: CONVERSATION_INCLUDE });
    if (!c) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
    return c;
  }

  private async addMessage(conversationId: string, sender: AuthUser, text: string) {
    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId, senderId: sender.id, text } });
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: m.createdAt } });
      await tx.conversationParticipant.updateMany({ where: { conversationId, userId: { not: sender.id } }, data: { unread: { increment: 1 } } });
      return m;
    });
    const others = await this.prisma.conversationParticipant.findMany({ where: { conversationId, userId: { not: sender.id } }, select: { userId: true } });
    for (const o of others) {
      this.realtime.toUser(o.userId, 'message', toMessage(msg));
      await this.notifications.notify(o.userId, { type: 'message', title: 'Yangi xabar', body: `${sender.fullName}: ${text.slice(0, 80)}`, link: `/messages/${conversationId}` });
    }
    this.realtime.toUser(sender.id, 'message', toMessage(msg));
    return msg;
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId: u.id } } },
      orderBy: { updatedAt: 'desc' },
      include: CONVERSATION_INCLUDE,
      take: 200,
    });
    return rows.map((c) => present(c, u.id));
  }

  @Get('unread')
  async unread(@CurrentUser() u: AuthUser) {
    const agg = await this.prisma.conversationParticipant.aggregate({ where: { userId: u.id }, _sum: { unread: true } });
    return { count: agg._sum.unread ?? 0 };
  }

  /** Returns the existing conversation with the recipient or starts one. */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async start(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    let recipientId = typeof body.recipientId === 'string' ? body.recipientId : undefined;
    if (body.companyId) recipientId = (await this.prisma.company.findUnique({ where: { id: String(body.companyId) }, select: { ownerId: true } }))?.ownerId;
    const recipient = recipientId && recipientId !== u.id ? await this.prisma.user.findUnique({ where: { id: recipientId } }) : null;
    if (!recipient || recipient.status !== 'active') throw new ApiError(400, 'INVALID_RECIPIENT', 'Invalid recipient');

    let conv = await this.prisma.conversation.findFirst({
      where: { AND: [{ participants: { some: { userId: u.id } } }, { participants: { some: { userId: recipient.id } } }] },
    });
    if (!conv) {
      const product = body.productId ? await this.prisma.product.findUnique({ where: { id: String(body.productId) }, select: { id: true, name: true } }) : null;
      conv = await this.prisma.conversation.create({
        data: {
          productId: product?.id,
          productName: product?.name,
          participants: { create: [{ userId: u.id }, { userId: recipient.id }] },
        },
      });
    }
    const text = String(body.text ?? '').trim();
    if (text) await this.addMessage(conv.id, u, text.slice(0, 2000));
    return present(await this.load(conv.id, u.id), u.id);
  }

  @Get(':id/messages')
  async messages(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.load(id, u.id);
    await this.prisma.conversationParticipant.updateMany({ where: { conversationId: id, userId: u.id, unread: { gt: 0 } }, data: { unread: 0 } });
    const [conversation, messages] = await Promise.all([
      this.load(id, u.id),
      this.prisma.message.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 500 }),
    ]);
    return { conversation: present(conversation, u.id), messages: messages.reverse().map(toMessage) };
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { text?: unknown }) {
    await this.load(id, u.id);
    const text = String(body?.text ?? '').trim();
    if (!text) validationError({ text: 'REQUIRED' });
    return toMessage(await this.addMessage(id, u, text.slice(0, 2000)));
  }
}

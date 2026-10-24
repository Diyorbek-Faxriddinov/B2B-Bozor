import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { env } from '../config/env';
import { ApiError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.decorators';

interface TokenPayload {
  sub: string;
  sid: string;
}

const DURATION_RE = /^(\d+)\s*([smhd])$/;
function durationMs(s: string) {
  const m = DURATION_RE.exec(s.trim());
  if (!m) return 30 * 86400000;
  return Number(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

/** Sessions are rows in the DB, so logout / blocking revokes a JWT immediately. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  hashPassword(password: string) {
    return hash(password);
  }

  async verifyPassword(passwordHash: string, password: string) {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async issueToken(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
    const ttl = durationMs(env().JWT_EXPIRES_IN);
    const session = await this.prisma.session.create({
      data: { userId, userAgent: meta.userAgent?.slice(0, 255), ip: meta.ip?.slice(0, 64), expiresAt: new Date(Date.now() + ttl) },
    });
    return this.jwt.signAsync({ sub: userId, sid: session.id } satisfies TokenPayload, { expiresIn: Math.floor(ttl / 1000) });
  }

  /** Resolves a bearer token to its user; throws 401/403 like the mock server. */
  async authenticate(token: string): Promise<AuthUser> {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { company: { select: { id: true } } } } },
    });
    if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
    if (session.user.status === 'blocked') throw new ApiError(403, 'ACCOUNT_BLOCKED', 'Account is blocked');
    // touch at most every 5 minutes
    if (Date.now() - session.lastUsedAt.getTime() > 5 * 60000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return { ...session.user, sessionId: session.id };
  }

  async revokeSession(sessionId: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string) {
    await this.prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
  }
}

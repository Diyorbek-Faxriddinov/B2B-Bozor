import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { env } from '../config/env';
import { ApiError, validationError } from '../common/errors';
import { DEFAULT_PREFS, toUser, type NotificationPrefs } from '../common/serialize';
import { json } from '../common/util';
import { EMAIL_RE, parse, PHONE_RE, zAddress } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../shared/sms.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const OTP_TTL_MS = 5 * 60000;

const prefsSchema = z.object({ email: z.boolean(), sms: z.boolean(), orders: z.boolean(), marketing: z.boolean() }).partial();

@ApiTags('users')
@Controller('users/me')
@Auth()
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sms: SmsService,
  ) {}

  @Patch()
  async update(@CurrentUser() u: AuthUser, @Body() body: Record<string, any>) {
    const fields: Record<string, string> = {};
    const data: Record<string, unknown> = {};

    if (body.fullName !== undefined) {
      const v = String(body.fullName).trim();
      if (v.length < 3 || v.length > 120) fields.fullName = 'MIN_LENGTH';
      else data.fullName = v;
    }
    if (body.phone !== undefined) {
      if (!PHONE_RE.test(String(body.phone))) fields.phone = 'INVALID_PHONE';
      else if (body.phone !== u.phone) Object.assign(data, { phone: body.phone, phoneVerified: false });
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) fields.email = 'INVALID_EMAIL';
      else if (email !== u.email && (await this.prisma.user.findUnique({ where: { email } }))) fields.email = 'EMAIL_TAKEN';
      else data.email = email;
    }
    if (Object.keys(fields).length) validationError(fields);

    if (body.organization !== undefined) data.organization = String(body.organization ?? '').trim().slice(0, 120) || null;
    if (body.avatar !== undefined) data.avatar = body.avatar ? String(body.avatar).slice(0, 2000) : null;
    if (body.addresses !== undefined) data.addresses = parse(z.array(zAddress).max(5, 'RANGE'), body.addresses);
    if (body.notificationPrefs !== undefined) {
      const current = { ...DEFAULT_PREFS, ...json<Partial<NotificationPrefs>>(u.notificationPrefs, {}) };
      data.notificationPrefs = { ...current, ...parse(prefsSchema, body.notificationPrefs) };
    }
    if (u.role === 'courier' && body.courier) {
      const c = parse(z.object({ transport: z.enum(['car', 'motorcycle', 'bicycle', 'truck']).optional(), region: z.string().trim().min(2).optional() }), body.courier);
      if (c.transport) data.courierTransport = c.transport;
      if (c.region) data.courierRegion = c.region;
    }

    const updated = await this.prisma.user.update({ where: { id: u.id }, data, include: { company: { select: { id: true } } } });
    return toUser(updated);
  }

  @Post('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async changePassword(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    if (!(await this.auth.verifyPassword(u.passwordHash, String(body.currentPassword ?? '')))) validationError({ currentPassword: 'WRONG_PASSWORD' });
    const next = String(body.newPassword ?? '');
    if (next.length < 8) validationError({ newPassword: 'MIN_LENGTH' });
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await this.auth.hashPassword(next) } });
    // sign out every other device
    await this.auth.revokeAllSessions(u.id, u.sessionId);
    return { ok: true };
  }

  /** Sends a 6-digit code to the profile phone (Eskiz). SMS notifications go only to verified phones. */
  @Post('phone/send-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async sendPhoneCode(@CurrentUser() u: AuthUser) {
    if (u.phoneVerified) return { ok: true, alreadyVerified: true };
    const code = String(randomInt(100000, 1000000));
    await this.prisma.otpCode.updateMany({ where: { userId: u.id, purpose: 'phone_verify', usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.otpCode.create({ data: { userId: u.id, purpose: 'phone_verify', codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
    await this.sms.send(u.phone, `B2B Bozor: tasdiqlash kodi ${code}. Kodni hech kimga bermang.`);
    const devCode = this.sms.mode === 'console' && env().NODE_ENV !== 'production' ? code : undefined;
    return { ok: true, channel: this.sms.mode, ...(devCode ? { devCode } : {}) };
  }

  @Post('phone/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyPhone(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    const code = String(body.code ?? '').trim();
    const otp = await this.prisma.otpCode.findFirst({
      where: { userId: u.id, purpose: 'phone_verify', usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= 5) throw new ApiError(400, 'CODE_EXPIRED', 'Code expired, request a new one');
    if (otp.codeHash !== sha256(code)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      validationError({ code: 'WRONG_CODE' });
    }
    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: u.id }, data: { phoneVerified: true } }),
    ]);
    const updated = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { company: { select: { id: true } } } });
    return toUser(updated);
  }
}

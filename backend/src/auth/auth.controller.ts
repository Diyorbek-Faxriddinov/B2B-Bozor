import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env';
import { ApiError, validationError } from '../common/errors';
import { DEFAULT_PREFS, toUser } from '../common/serialize';
import { randomToken, slugify } from '../common/util';
import { EMAIL_RE, PHONE_RE } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { NotificationsService } from '../shared/notifications.service';
import { Auth, CurrentUser, type AuthUser } from './auth.decorators';
import { AuthService } from './auth.service';

const TRANSPORTS = ['car', 'motorcycle', 'bicycle', 'truck'];
const RESET_TTL_MS = 30 * 60000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const DEFAULT_COURIER_SCHEDULE = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, active: d < 5, from: '09:00', to: '18:00' }));

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() body: Record<string, any>, @Req() req: Request) {
    const role = body.role;
    if (!['buyer', 'seller', 'courier'].includes(role)) validationError({ role: 'REQUIRED' });
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.fullName ?? '').trim();
    const phone = String(body.phone ?? '');
    const password = String(body.password ?? '');
    const company = body.company as { name?: string; tin?: string; region?: string } | undefined;
    const courier = body.courier as { transport?: string; region?: string } | undefined;

    const fields: Record<string, string> = {};
    if (fullName.length < 3) fields.fullName = 'MIN_LENGTH';
    if (!EMAIL_RE.test(email) || email.length > 190) fields.email = 'INVALID_EMAIL';
    else if (await this.prisma.user.findUnique({ where: { email } })) fields.email = 'EMAIL_TAKEN';
    if (!PHONE_RE.test(phone)) fields.phone = 'INVALID_PHONE';
    if (password.length < 8) fields.password = 'MIN_LENGTH';
    if (role === 'seller') {
      if (!company?.name?.trim()) fields['company.name'] = 'REQUIRED';
      if (!/^\d{9}$/.test(company?.tin ?? '')) fields['company.tin'] = 'INVALID_TIN';
      else if (await this.prisma.company.findUnique({ where: { tin: company!.tin } })) fields['company.tin'] = 'TIN_TAKEN';
      if (!company?.region?.trim()) fields['company.region'] = 'REQUIRED';
    }
    if (role === 'courier') {
      if (!TRANSPORTS.includes(courier?.transport ?? '')) fields['courier.transport'] = 'REQUIRED';
      if (!courier?.region?.trim()) fields['courier.region'] = 'REQUIRED';
    }
    if (Object.keys(fields).length) validationError(fields);

    const passwordHash = await this.auth.hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          role,
          fullName,
          email,
          phone,
          passwordHash,
          organization: role === 'buyer' ? String(body.organization ?? '').trim() || null : null,
          addresses: [],
          notificationPrefs: DEFAULT_PREFS as object,
          ...(role === 'courier'
            ? { courierTransport: courier!.transport, courierRegion: courier!.region!.trim(), courierRating: 5, courierSchedule: DEFAULT_COURIER_SCHEDULE }
            : {}),
        },
      });
      if (role === 'seller') {
        const name = company!.name!.trim();
        await tx.company.create({
          data: {
            ownerId: u.id,
            name,
            slug: `${slugify(name) || 'kompaniya'}-${u.id.slice(-4)}`,
            tin: company!.tin!,
            description: '',
            region: company!.region!.trim(),
            address: company!.region!.trim(),
            phone,
            email,
            foundedYear: new Date().getFullYear(),
            employees: '1–10',
            mainCategories: [],
            pickupPoint: { label: 'Ombor', text: 'Toshkent', lat: 41.2995, lng: 69.2401 },
          },
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, include: { company: { select: { id: true } } } });
    });

    if (role === 'seller') {
      await this.notifications.notifyAdmins({
        type: 'system',
        title: 'Yangi kompaniya',
        body: `${company!.name!.trim()} ro'yxatdan o'tdi va tasdiqlashni kutmoqda.`,
        link: '/admin/companies',
      });
    }
    await this.notifications.notify(
      user.id,
      { type: 'system', title: 'Xush kelibsiz!', body: "B2B Bozor platformasiga xush kelibsiz. Profilingizni to'ldirishni unutmang.", link: '/account/profile' },
      { email: true },
    );
    return { token: await this.auth.issueToken(user.id, this.meta(req)), user: toUser(user) };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, include: { company: { select: { id: true } } } });
    const ok = user ? await this.auth.verifyPassword(user.passwordHash, String(body.password ?? '')) : false;
    if (!user || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    if (user.status === 'blocked') throw new ApiError(403, 'ACCOUNT_BLOCKED', 'Account is blocked');
    return { token: await this.auth.issueToken(user.id, this.meta(req)), user: toUser(user) };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser | null) {
    if (user) await this.auth.revokeSession(user.sessionId);
    return { ok: true };
  }

  @Get('me')
  @Auth()
  me(@CurrentUser() user: AuthUser) {
    return toUser(user);
  }

  /** Always `{ ok: true }` so the endpoint can't be used to probe emails. */
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotPassword(@Body() body: Record<string, unknown>) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    if (user && user.status === 'active') {
      const token = randomToken(32);
      await this.prisma.otpCode.updateMany({ where: { userId: user.id, purpose: 'password_reset', usedAt: null }, data: { usedAt: new Date() } });
      await this.prisma.otpCode.create({
        data: { userId: user.id, purpose: 'password_reset', codeHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      await this.mail.send({
        to: user.email,
        subject: 'Parolni tiklash',
        text: `${user.fullName}, parolingizni tiklash uchun so'rov oldik.\n\nQuyidagi havola 30 daqiqa amal qiladi. Agar so'rovni siz yubormagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.`,
        action: { label: "Yangi parol o'rnatish", url: `${env().FRONTEND_URL}/reset-password?token=${token}` },
      });
    }
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async resetPassword(@Body() body: Record<string, unknown>) {
    const token = String(body.token ?? '');
    const password = String(body.password ?? '');
    if (password.length < 8) validationError({ password: 'MIN_LENGTH' });
    const otp = token
      ? await this.prisma.otpCode.findFirst({ where: { purpose: 'password_reset', codeHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } } })
      : null;
    if (!otp) throw new ApiError(400, 'INVALID_TOKEN', 'Reset link is invalid or expired');
    const passwordHash = await this.auth.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: otp.userId }, data: { passwordHash } }),
      this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
    ]);
    await this.auth.revokeAllSessions(otp.userId);
    return { ok: true };
  }
}

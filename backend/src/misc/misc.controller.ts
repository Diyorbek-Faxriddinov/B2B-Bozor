import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { env } from '../config/env';
import { validationError } from '../common/errors';
import { EMAIL_RE } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { NotificationsService } from '../shared/notifications.service';
import { SmsService } from '../shared/sms.service';
import { AiService } from '../ai/ai.service';
import { PaymentsService } from '../payments/payments.service';

@ApiTags('misc')
@Controller()
export class MiscController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly ai: AiService,
    private readonly payments: PaymentsService,
  ) {}

  /** Liveness + which integrations run for real vs in fallback mode. */
  @Get('health')
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      ok: db === 'ok',
      db,
      env: env().NODE_ENV,
      integrations: {
        ai: this.ai.mode,
        mail: this.mail.mode,
        sms: this.sms.mode,
        payme: this.payments.paymeMode,
        click: this.payments.clickMode,
      },
    };
  }

  @Post('contact')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async contact(@Body() body: Record<string, unknown>) {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const message = String(body.message ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const fields: Record<string, string> = {};
    if (name.length < 2) fields.name = 'MIN_LENGTH';
    if (!EMAIL_RE.test(email)) fields.email = 'INVALID_EMAIL';
    if (message.length < 10) fields.message = 'MIN_LENGTH';
    if (Object.keys(fields).length) validationError(fields);
    await this.prisma.contactMessage.create({ data: { name: name.slice(0, 120), email: email.slice(0, 190), subject: subject.slice(0, 200), message: message.slice(0, 5000) } });
    await this.notifications.notifyAdmins({ type: 'system', title: 'Yangi murojaat', body: `${name}: ${(subject || message).slice(0, 60)}` });
    return { ok: true };
  }

  @Post('newsletter')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async newsletter(@Body() body: Record<string, unknown>) {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 190) validationError({ email: 'INVALID_EMAIL' });
    await this.prisma.newsletterSubscriber.upsert({ where: { email }, create: { email }, update: {} });
    return { ok: true };
  }
}

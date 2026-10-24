import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { env } from '../config/env';
import { DEFAULT_PREFS, toNotification, type NotificationPrefs } from '../common/serialize';
import { json } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { RealtimeGateway } from './realtime.gateway';
import { SmsService } from './sms.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export interface Channels {
  /** Also send an email (respects the user's email / orders preferences). */
  email?: boolean;
  /** Also send an SMS — only to verified phones (respects sms / orders preferences). */
  sms?: string;
}

/** In-app notification + realtime push + optional email/SMS fan-out. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notify');

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  async notify(userId: string, n: NotifyInput, channels: Channels = {}) {
    const row = await this.prisma.notification.create({ data: { userId, ...n } });
    this.realtime.toUser(userId, 'notification', toNotification(row));
    if (channels.email || channels.sms) void this.fanOut(userId, n, channels);
    return row;
  }

  async notifyMany(userIds: string[], n: NotifyInput, channels: Channels = {}) {
    for (const id of new Set(userIds)) await this.notify(id, n, channels);
  }

  async notifyAdmins(n: NotifyInput) {
    const admins = await this.prisma.user.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
    await this.notifyMany(
      admins.map((a) => a.id),
      n,
    );
  }

  private async fanOut(userId: string, n: NotifyInput, channels: Channels) {
    try {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u || u.status !== 'active') return;
      const prefs = { ...DEFAULT_PREFS, ...json<Partial<NotificationPrefs>>(u.notificationPrefs, {}) };
      if (n.type === 'order' && !prefs.orders) return;
      if (channels.email && prefs.email) {
        await this.mail.send({
          to: u.email,
          subject: n.title,
          text: `${u.fullName}, assalomu alaykum!\n\n${n.body}`,
          action: n.link ? { label: "Batafsil ko'rish", url: `${env().FRONTEND_URL}${n.link}` } : undefined,
        });
      }
      if (channels.sms && prefs.sms && u.phoneVerified) await this.sms.send(u.phone, channels.sms);
    } catch (err) {
      this.logger.warn(`fan-out failed: ${(err as Error).message}`);
    }
  }
}

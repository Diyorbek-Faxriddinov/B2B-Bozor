import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

const ESKIZ = 'https://notify.eskiz.uz/api';

/**
 * Eskiz.uz SMS gateway. Without ESKIZ_EMAIL/ESKIZ_PASSWORD messages are only logged.
 * Note: Eskiz delivers only texts matching templates approved in your cabinet.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SMS');
  private token: string | null = null;

  get mode() {
    const e = env();
    return e.ESKIZ_EMAIL && e.ESKIZ_PASSWORD ? 'eskiz' : 'console';
  }

  private async login() {
    const e = env();
    const res = await fetch(`${ESKIZ}/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({ email: e.ESKIZ_EMAIL!, password: e.ESKIZ_PASSWORD! }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { data?: { token?: string }; message?: string };
    if (!res.ok || !data.data?.token) throw new Error(`Eskiz login failed: ${data.message ?? res.status}`);
    this.token = data.data.token;
    return this.token;
  }

  private async post(path: string, body: Record<string, string>, retry = true): Promise<unknown> {
    const token = this.token ?? (await this.login());
    const res = await fetch(`${ESKIZ}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 && retry) {
      this.token = null;
      return this.post(path, body, false);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Eskiz ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }

  /** `phone` in +998XXXXXXXXX format. Never throws. */
  async send(phone: string, message: string): Promise<boolean> {
    const mobile = phone.replace(/\D/g, '');
    if (!/^998\d{9}$/.test(mobile)) return false;
    if (this.mode === 'console') {
      this.logger.log(`[console] to=+${mobile} "${message}"`);
      return false;
    }
    try {
      await this.post('/message/sms/send', { mobile_phone: mobile, message, from: env().ESKIZ_FROM });
      return true;
    } catch (err) {
      this.logger.warn((err as Error).message);
      return false;
    }
  }
}

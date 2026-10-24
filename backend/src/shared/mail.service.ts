import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailInput {
  to: string;
  subject: string;
  /** Plain-text paragraphs; rendered into the HTML layout too. */
  text: string;
  action?: { label: string; url: string };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout({ subject, text, action }: MailInput) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = action
    ? `<p style="margin:22px 0 6px"><a href="${escape(action.url)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block">${escape(action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1c1c1a">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
  <div style="font-weight:800;font-size:18px;margin-bottom:16px;color:#0f766e">B2B Bozor</div>
  <div style="background:#fff;border-radius:16px;padding:26px 24px;border:1px solid #e6e6e1">
    <h1 style="font-size:19px;margin:0 0 14px">${escape(subject)}</h1>
    ${paragraphs}${button}
  </div>
  <p style="font-size:12px;color:#77776f;margin-top:16px">Bu xat avtomatik yuborildi. Bildirishnoma sozlamalarini kabinetingizda o'zgartirishingiz mumkin.</p>
</div></body></html>`;
}

/** SMTP mail. Without SMTP settings (or for demo domains) messages are only logged. */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  private readonly skip: string[];

  constructor() {
    const e = env();
    this.skip = e.MAIL_SKIP_DOMAINS.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
    this.transporter = e.SMTP_HOST
      ? nodemailer.createTransport({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
        })
      : null;
  }

  get mode() {
    return this.transporter ? 'smtp' : 'console';
  }

  async verify() {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      this.logger.warn(`SMTP connection failed: ${(err as Error).message}`);
      return false;
    }
  }

  async send(input: MailInput): Promise<boolean> {
    const domain = input.to.split('@')[1]?.toLowerCase() ?? '';
    if (!this.transporter || this.skip.includes(domain)) {
      this.logger.log(`[console] to=${input.to} subject="${input.subject}"${input.action ? ` link=${input.action.url}` : ''}`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: env().MAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.action ? `${input.text}\n\n${input.action.label}: ${input.action.url}` : input.text,
        html: layout(input),
      });
      return true;
    } catch (err) {
      this.logger.warn(`send to ${input.to} failed: ${(err as Error).message}`);
      return false;
    }
  }
}

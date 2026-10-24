import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { env } from '../config/env';
import { formatMoney } from '../ai/ai.fallback';
import { PaymentsService } from './payments.service';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Starts a card payment for unpaid orders → `{ id, url }`; the frontend redirects to `url`. */
  @Post()
  @Auth('buyer')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  create(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    return this.payments.create(u, body ?? {});
  }

  /* ---------- provider callbacks (no bearer auth; verified by key / signature) ---------- */

  /** Payme Merchant API endpoint. Set this URL in the Payme cabinet; account field: `payment_id`. */
  @Post('payme')
  @HttpCode(200)
  @SkipThrottle()
  payme(@Body() body: unknown, @Headers('authorization') auth?: string) {
    return this.payments.payme(body, auth);
  }

  /** Click SHOP API — "Prepare URL" in the Click cabinet. */
  @Post('click/prepare')
  @HttpCode(200)
  @SkipThrottle()
  clickPrepare(@Body() body: Record<string, string>) {
    return this.payments.clickPrepare(stringify(body));
  }

  /** Click SHOP API — "Complete URL" in the Click cabinet. */
  @Post('click/complete')
  @HttpCode(200)
  @SkipThrottle()
  clickComplete(@Body() body: Record<string, string>) {
    return this.payments.clickComplete(stringify(body));
  }

  /* ---------- local payment simulator (only without merchant keys, never in production) ---------- */

  @Get('simulator/:id')
  @ApiExcludeEndpoint()
  async simulator(@Param('id') id: string, @Res() res: Response) {
    const s = await this.payments.summary(id);
    if (!s || !this.payments.simulatorEnabled(s.payment.provider)) return res.status(404).type('text/plain').send('Not found');
    const p = s.payment;
    const brand = p.provider === 'payme' ? { name: 'Payme', color: '#00cccc' } : { name: 'Click', color: '#0066ff' };
    const finished = p.status !== 'created' && p.status !== 'pending';
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${env().FRONTEND_URL}`);
    res.type('html').send(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${brand.name} — test to'lov</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f4f7;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#15171a">
<main style="width:min(420px,calc(100% - 32px));background:#fff;border-radius:20px;box-shadow:0 10px 40px #0001;overflow:hidden">
  <div style="background:${brand.color};color:#fff;padding:20px 24px;font-weight:800;font-size:22px">${brand.name}<span style="font-weight:500;font-size:13px;opacity:.85;margin-left:10px">test rejimi</span></div>
  <div style="padding:22px 24px">
    <div style="font-size:13px;color:#667">To'lov summasi</div>
    <div style="font-size:30px;font-weight:800;margin:4px 0 14px">${escape(formatMoney(p.amount, 'uz'))}</div>
    <ul style="padding:0;margin:0 0 18px;list-style:none;font-size:14px;color:#334">
      ${s.orders.map((o) => `<li style="display:flex;justify-content:space-between;border-top:1px solid #eef;padding:8px 0"><span>${escape(o.number)} · ${escape(o.companyName)}</span><b>${escape(formatMoney(o.total, 'uz'))}</b></li>`).join('')}
    </ul>
    <p style="font-size:12.5px;color:#667;background:#f6f7f9;border-radius:10px;padding:10px 12px;line-height:1.5;margin:0 0 18px">
      Bu lokal simulyator: haqiqiy pul yechilmaydi. "To'lash" tugmasi ${brand.name} serveri yuboradigan so'rovlarni
      (${p.provider === 'payme' ? 'CheckPerformTransaction → CreateTransaction → PerformTransaction' : 'Prepare → Complete'}) backend'ga aynan protokol bo'yicha yuboradi.
    </p>
    ${
      finished
        ? `<p style="font-weight:600">Holat: ${escape(p.status)}</p><a href="${escape(this.payments.returnUrl(p.id))}" style="display:block;text-align:center;background:#15171a;color:#fff;border-radius:12px;padding:13px;text-decoration:none;font-weight:600">Do'konga qaytish</a>`
        : `<form method="post" action="${escape(id)}/pay"><button style="width:100%;border:0;background:${brand.color};color:#fff;font-size:16px;font-weight:700;border-radius:12px;padding:14px;cursor:pointer">To'lash</button></form>
    <form method="post" action="${escape(id)}/cancel" style="margin-top:10px"><button style="width:100%;border:1px solid #d5d8de;background:#fff;color:#334;font-size:15px;border-radius:12px;padding:12px;cursor:pointer">Bekor qilish</button></form>`
    }
  </div>
</main></body></html>`);
  }

  @Post('simulator/:id/pay')
  @ApiExcludeEndpoint()
  async simulatePay(@Param('id') id: string, @Res() res: Response) {
    const s = await this.payments.summary(id);
    if (!s || !this.payments.simulatorEnabled(s.payment.provider)) return res.status(404).type('text/plain').send('Not found');
    const r = await this.payments.simulatePay(s.payment);
    if (!r.ok) return res.status(409).type('text/plain').send(`To'lov amalga oshmadi: ${r.error}`);
    res.setHeader('Content-Security-Policy', `default-src 'none'; form-action 'self' ${env().FRONTEND_URL}`);
    return res.redirect(303, this.payments.returnUrl(id));
  }

  @Post('simulator/:id/cancel')
  @ApiExcludeEndpoint()
  async simulateCancel(@Param('id') id: string, @Res() res: Response) {
    const s = await this.payments.summary(id);
    if (!s || !this.payments.simulatorEnabled(s.payment.provider)) return res.status(404).type('text/plain').send('Not found');
    await this.payments.simulateCancel(s.payment);
    res.setHeader('Content-Security-Policy', `default-src 'none'; form-action 'self' ${env().FRONTEND_URL}`);
    return res.redirect(303, this.payments.returnUrl(id));
  }

  @Get(':id')
  @Auth()
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.payments.get(u, id);
  }
}

/** Click posts form fields; make sure every value is a string for signature checks. */
function stringify(body: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, v === undefined || v === null ? '' : String(v)]));
}

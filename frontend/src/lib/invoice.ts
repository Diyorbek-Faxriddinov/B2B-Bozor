import type { Locale, Order } from '@/types';
import { translate } from '@/i18n';
import { formatDateTime, formatMoney, formatNumber } from './utils';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Opens a print-ready invoice (hisob-faktura) for an order. Amounts are always in UZS. */
export function printInvoice(order: Order, locale: Locale) {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const money = (n: number) => formatMoney(n, 'UZS', locale);
  const rows = order.items
    .map(
      (it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(it.name)}</td>
        <td class="r">${formatNumber(it.quantity, locale)} ${esc(t(`units.${it.unit}`))}</td>
        <td class="r">${money(it.unitPrice)}</td>
        <td class="r">${money(it.total)}</td>
      </tr>`,
    )
    .join('');
  const vat = Math.round(order.subtotal - order.subtotal / 1.12);
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(order.number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Inter,system-ui,sans-serif;color:#0f172a;margin:0;padding:40px;font-size:13px}
    h1{font-size:22px;margin:0} .muted{color:#64748b} .row{display:flex;justify-content:space-between;gap:24px}
    .box{border:1px solid #e2e8f0;border-radius:10px;padding:14px;flex:1}
    table{width:100%;border-collapse:collapse;margin-top:24px} th,td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left}
    th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#475569} .r{text-align:right}
    .tot td{border:none;padding:5px 10px} .grand td{font-size:16px;font-weight:700;border-top:2px solid #0f172a}
    .brand{font-weight:800;font-size:18px} .brand span{color:#1d4ed8} @media print{body{padding:0}}
  </style></head><body>
  <div class="row" style="align-items:flex-start">
    <div><div class="brand">B2B<span>Bozor</span></div><div class="muted">b2bbozor.uz</div></div>
    <div style="text-align:right"><h1>${esc(t('invoice.title'))}</h1><div class="muted">№ ${esc(order.number)} · ${formatDateTime(order.createdAt, locale)}</div></div>
  </div>
  <div class="row" style="margin-top:28px">
    <div class="box"><div class="muted">${esc(t('invoice.seller'))}</div><b>${esc(order.companyName)}</b><div>${esc(order.delivery.pickupPoint.text)}</div></div>
    <div class="box"><div class="muted">${esc(t('invoice.buyer'))}</div><b>${esc(order.buyerOrganization ?? order.buyerName)}</b><div>${esc(order.buyerName)} · ${esc(order.buyerPhone)}</div>
    ${order.delivery.address ? `<div>${esc(order.delivery.address.text)}</div>` : ''}</div>
  </div>
  <table><thead><tr><th>#</th><th>${esc(t('invoice.item'))}</th><th class="r">${esc(t('invoice.qty'))}</th><th class="r">${esc(t('invoice.price'))}</th><th class="r">${esc(t('invoice.sum'))}</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <table style="width:320px;margin-left:auto;margin-top:12px">
    <tr class="tot"><td>${esc(t('checkout.goods'))}</td><td class="r">${money(order.subtotal)}</td></tr>
    <tr class="tot"><td class="muted">${esc(t('invoice.vat'))}</td><td class="r muted">${money(vat)}</td></tr>
    <tr class="tot"><td>${esc(t('cart.delivery'))}</td><td class="r">${money(order.deliveryFee)}</td></tr>
    <tr class="tot grand"><td>${esc(t('cart.total'))}</td><td class="r">${money(order.total)}</td></tr>
  </table>
  <p class="muted" style="margin-top:32px">${esc(t('invoice.payment'))}: ${esc(t(`checkout.payment.${order.paymentMethod}`))} · ${esc(t(`order.payment.${order.paymentStatus}`))}</p>
  <div class="row" style="margin-top:48px"><div>${esc(t('invoice.sellerSign'))}: ____________</div><div>${esc(t('invoice.buyerSign'))}: ____________</div></div>
  <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

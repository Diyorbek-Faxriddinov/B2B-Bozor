import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AuthUser, Locale } from '../auth/auth.decorators';
import { env } from '../config/env';
import type { AiMessage } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { ruleBasedReply, type Reply } from './ai.fallback';
import { AI_TOOLS, runTool, type ToolOutputs } from './ai.tools';

const MAX_TOOL_ROUNDS = 8;
const HISTORY_MESSAGES = 20;
const LANG_NAME: Record<Locale, string> = { uz: "Uzbek (Latin script, o'zbek tili)", ru: 'Russian', en: 'English' };

function systemPrompt(user: AuthUser, locale: Locale) {
  return `You are the shopping assistant of B2B Bozor — a wholesale (B2B) marketplace in Uzbekistan where companies buy from verified suppliers.

# Who you are talking to
- Name: ${user.fullName}; role: ${user.role}${user.organization ? `; organization: ${user.organization}` : ''}.
- Interface language: ${LANG_NAME[locale]}. Reply in the language the user writes in; if unclear, use the interface language.

# How to answer
- Never invent products, prices, stock or order data. Look them up with the tools; quote exact numbers from tool results.
- When you recommend products, call show_products with their ids so the user sees cards with an add-to-cart button. Mention at most 6.
- For totals at a quantity, call calculate_price (volume tiers and discounts change the unit price).
- Prices are integers in UZS ("so'm"); format with spaces as thousands separators, e.g. 385 000 so'm.
- Keep replies short and scannable: Markdown, bold for key numbers, bullet lists for comparisons. No tables wider than 4 columns.
- When useful, call suggest_replies with 2–4 natural follow-up questions.
- Link to pages with Markdown links using these paths: /catalog, /products/{id}, /suppliers/{companyId}, /cart, /account/orders, /account/rfqs, /seller/orders, /help.
- Stay on topic (purchasing, suppliers, orders, delivery, payments, using the platform). Politely decline unrelated requests.

# Platform facts
- Minimum order quantity (MOQ) applies per product; larger quantities unlock volume price tiers.
- A cart with several suppliers becomes one order per supplier.
- Courier delivery: 30 000 so'm + 2 500 so'm per km beyond 3 km (road distance from the supplier's warehouse), free for orders from 5 000 000 so'm; courier radius 60 km. Pickup from the warehouse is free.
- Payment: bank card via Payme or Click (instant), bank transfer (invoice after the supplier confirms; good for companies), cash to the courier.
- Order statuses: pending → confirmed → ready → in_transit → delivered (or cancelled). Buyers can cancel while pending. Live courier tracking is on the order page.
- RFQ (request for quotation): on a product page press "Request a quote", give quantity and target price; the supplier's offer appears under Account → Quotes.
- Returns: defective or not-as-described goods within 14 days — message the supplier from the order page.
- To sell: register with the "Seller" role, company name and 9-digit TIN (STIR); products of verified companies go live immediately, others after moderation.
- Today is ${new Date().toISOString().slice(0, 10)}.`;
}

/**
 * Claude-powered assistant with catalog/order tools. Without ANTHROPIC_API_KEY — or when
 * the API fails — it answers with the rule-based engine so the chat never breaks.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger('AI');
  private readonly client: Anthropic | null;

  constructor(private readonly prisma: PrismaService) {
    const key = env().ANTHROPIC_API_KEY;
    this.client = key ? new Anthropic({ apiKey: key, timeout: 90_000, maxRetries: 2 }) : null;
  }

  get mode() {
    return this.client ? `claude (${env().AI_MODEL})` : 'rule-based';
  }

  async reply(user: AuthUser, locale: Locale, history: AiMessage[]): Promise<Reply> {
    const last = history[history.length - 1]?.content ?? '';
    if (!this.client) return ruleBasedReply(this.prisma, last, user, locale);
    try {
      return await this.claude(user, locale, history);
    } catch (err) {
      if (err instanceof Anthropic.APIError) this.logger.warn(`Claude API error ${err.status ?? ''}: ${err.message}`);
      else this.logger.warn(`Claude call failed: ${(err as Error).message}`);
      return ruleBasedReply(this.prisma, last, user, locale);
    }
  }

  private async claude(user: AuthUser, locale: Locale, history: AiMessage[]): Promise<Reply> {
    // Earlier turns are replayed as plain text; tool calls only live within the current turn.
    const messages: BetaMessageParam[] = history.slice(-HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }));
    while (messages.length && messages[0].role !== 'user') messages.shift();
    const out: ToolOutputs = { productIds: [], suggestions: [] };

    let response: BetaMessage | null = null;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      response = await this.client!.beta.messages.create({
        model: env().AI_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        // re-runs a declined request on Anthropic's recommended fallback model
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: systemPrompt(user, locale),
        tools: AI_TOOLS,
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return {
          content:
            locale === 'ru'
              ? 'Извините, с этим запросом я помочь не могу. Спросите о товарах, заказах или доставке.'
              : locale === 'en'
                ? "Sorry, I can't help with that request. Ask me about products, orders or delivery."
                : "Kechirasiz, bu so'rov bo'yicha yordam bera olmayman. Mahsulotlar, buyurtmalar yoki yetkazib berish haqida so'rang.",
        };
      }
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      if (response.stop_reason !== 'tool_use') break;

      const calls = response.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: response.content });
      const results: BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const r = await runTool(this.prisma, user, call.name, (call.input ?? {}) as Record<string, unknown>, out);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }

    const text = (response?.content ?? [])
      .filter((b): b is Extract<BetaMessage['content'][number], { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n')
      .trim();
    if (!text && !out.productIds.length) throw new Error(`empty reply (stop_reason=${response?.stop_reason})`);
    return {
      content: text || (locale === 'ru' ? 'Вот подходящие товары:' : locale === 'en' ? 'Here are matching products:' : 'Mana sizga mos mahsulotlar:'),
      ...(out.productIds.length ? { productIds: out.productIds } : {}),
      ...(out.suggestions.length ? { suggestions: out.suggestions } : {}),
    };
  }
}

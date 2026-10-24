import { resolve } from 'node:path';
import { z } from 'zod';

/** Empty strings in .env mean "not configured". */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(v.toLowerCase())));
const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : def))
    .pipe(z.number().int());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000),
  APP_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is empty — run `npm run db:setup` first'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  ANTHROPIC_API_KEY: optional,
  AI_MODEL: z.string().default('claude-opus-5-5'),

  SMTP_HOST: optional,
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: z.string().default('B2B Bozor <no-reply@b2bbozor.uz>'),
  /** Recipients on these domains are only logged (seed/demo accounts). */
  MAIL_SKIP_DOMAINS: z.string().default('demo.uz,example.com'),

  ESKIZ_EMAIL: optional,
  ESKIZ_PASSWORD: optional,
  ESKIZ_FROM: z.string().default('4546'),

  PAYME_MERCHANT_ID: optional,
  PAYME_KEY: optional,
  PAYME_TEST_KEY: optional,
  PAYME_TEST_MODE: bool(true),

  CLICK_SERVICE_ID: optional,
  CLICK_MERCHANT_ID: optional,
  CLICK_MERCHANT_USER_ID: optional,
  CLICK_SECRET_KEY: optional,

  OSRM_URL: z.string().default('https://router.project-osrm.org'),
  NOMINATIM_URL: z.string().default('https://nominatim.openstreetmap.org'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: int(8),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid backend/.env:\n${lines}`);
  }
  cached = parsed.data;
  return cached;
}

/** Absolute path of the uploads directory. */
export const uploadRoot = () => resolve(process.cwd(), env().UPLOAD_DIR);

/** Validated environment (loaded once at startup). */
export function env(): Env {
  return cached ?? loadEnv();
}

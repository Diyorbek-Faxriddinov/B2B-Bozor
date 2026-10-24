import { z } from 'zod';
import { validationError } from './errors';

/**
 * Parses a request body with a zod schema and maps issues to the frontend's
 * field codes: `{ "company.tin": "INVALID_TIN" }`. Schema messages ARE the codes.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (fields[key]) continue;
    fields[key] = /^[A-Z_]+$/.test(issue.message) ? issue.message : issue.code === 'invalid_type' ? 'REQUIRED' : 'INVALID';
  }
  validationError(fields);
}

export const PHONE_RE = /^\+998\d{9}$/;
export const EMAIL_RE = /^\S+@\S+\.\S+$/;

export const zEmail = z
  .string({ error: 'REQUIRED' })
  .trim()
  .toLowerCase()
  .regex(EMAIL_RE, 'INVALID_EMAIL')
  .max(190, 'INVALID_EMAIL');
export const zPhone = z.string({ error: 'INVALID_PHONE' }).regex(PHONE_RE, 'INVALID_PHONE');
export const zText = (min: number, max = 5000) => z.string({ error: 'REQUIRED' }).trim().min(min, 'MIN_LENGTH').max(max, 'MAX_LENGTH');
export const zOptText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, 'MAX_LENGTH')
    .optional()
    .nullable()
    .transform((v) => v || undefined);

export const zAddress = z.object({
  lat: z.number({ error: 'REQUIRED' }).min(-90).max(90),
  lng: z.number({ error: 'REQUIRED' }).min(-180).max(180),
  text: z.string({ error: 'REQUIRED' }).trim().min(1, 'REQUIRED').max(300),
  label: zOptText(60),
  apartment: zOptText(30),
  entrance: zOptText(30),
  floor: zOptText(30),
  landmark: zOptText(200),
  contactName: zOptText(100),
  contactPhone: zOptText(30),
});
export type AddressInput = z.infer<typeof zAddress>;

/** Query-string helpers (everything arrives as strings). */
export const q = {
  str: (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
  num: (v: unknown) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : undefined;
  },
  bool: (v: unknown) => String(v) === 'true',
};

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { translate } from '@/i18n';
import { useSettings } from '@/stores/settings';

/** Human-readable, localized message for any thrown error. */
export function errorMessage(err: unknown): string {
  const locale = useSettings.getState().locale;
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const msg = translate(locale, key);
    return msg !== key ? msg : err.message;
  }
  return translate(locale, 'errors.generic');
}

/** Maps backend field errors (codes) onto react-hook-form fields. Returns true if any were applied. */
export function applyFieldErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>) {
  if (!(err instanceof ApiError) || !err.fields) return false;
  const locale = useSettings.getState().locale;
  for (const [field, code] of Object.entries(err.fields)) {
    setError(field as Path<T>, { type: 'server', message: translate(locale, `validation.${code}`) });
  }
  return true;
}

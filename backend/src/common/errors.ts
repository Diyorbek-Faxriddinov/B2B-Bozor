/**
 * API errors in the frontend contract shape:
 *   { "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "email": "EMAIL_TAKEN" } } }
 * `code` and `fields` values are translated by the frontend (i18n errors.* / validation.*).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function validationError(fields: Record<string, string>): never {
  throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', fields);
}

export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Access denied') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);

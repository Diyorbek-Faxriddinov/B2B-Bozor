import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { ApiError } from './errors';

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

/** Renders every error in the `{ error: { code, message, fields? } }` contract. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    res.status(status).json({ error: body });
  }

  private toBody(e: unknown): { status: number; body: { code: string; message: string; fields?: Record<string, string> } } {
    if (e instanceof ApiError) return { status: e.status, body: { code: e.code, message: e.message, fields: e.fields } };

    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      const message = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? e.message);
      return { status, body: { code: HTTP_CODES[status] ?? 'HTTP_ERROR', message: Array.isArray(message) ? message.join('; ') : message } };
    }

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { status: 404, body: { code: 'NOT_FOUND', message: 'Record not found' } };
      if (e.code === 'P2002') return { status: 409, body: { code: 'CONFLICT', message: 'Duplicate value' } };
    }

    // body-parser errors (malformed JSON, too large)
    const anyErr = e as { type?: string; status?: number };
    if (anyErr?.type === 'entity.parse.failed') return { status: 400, body: { code: 'BAD_REQUEST', message: 'Malformed JSON' } };
    if (anyErr?.type === 'entity.too.large') return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } };

    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
  }
}

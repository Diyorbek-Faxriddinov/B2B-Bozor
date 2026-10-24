import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Company, Role, User } from '@prisma/client';

export type AuthUser = User & { company: Pick<Company, 'id'> | null; sessionId: string };

export const ROLES_KEY = 'auth:roles';

/**
 * Requires an authenticated user. With roles, the user must have one of them.
 * Routes without @Auth are public (a valid token is still attached when present).
 */
export const Auth = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated user (or null on public routes). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user ?? null);

/** Accept-Language → uz | ru | en. */
export type Locale = 'uz' | 'ru' | 'en';
export const Lang = createParamDecorator((_: unknown, ctx: ExecutionContext): Locale => {
  const h = String(ctx.switchToHttp().getRequest().headers['accept-language'] ?? '').slice(0, 2).toLowerCase();
  return h === 'ru' || h === 'en' ? h : 'uz';
});

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../common/errors';
import { ROLES_KEY } from './auth.decorators';
import { AuthService } from './auth.service';

/**
 * Global guard. A bearer token, when sent, must be valid on every route (the frontend
 * logs out on 401). Role requirements come from @Auth(...roles).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = token ? await this.auth.authenticate(token) : null;
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles === undefined) return true;
    if (!user) throw unauthorized();
    if (roles.length && !roles.includes(user.role)) throw forbidden();
    return true;
  }
}

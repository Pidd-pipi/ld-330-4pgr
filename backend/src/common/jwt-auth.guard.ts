import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { APP_MESSAGES } from './constants';
import { ROLES_KEY } from './roles.decorator';

export interface JwtUser {
  username: string;
  role: string;
  name: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: JwtUser;
    }>();
    const authorization = request.headers.authorization ?? '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(APP_MESSAGES.unauthorized);
    }
    try {
      const payload = this.jwtService.verify<{ sub: string; role: string; name: string }>(token);
      request.user = { username: payload.sub, role: payload.role, name: payload.name };
    } catch {
      throw new UnauthorizedException(APP_MESSAGES.unauthorized);
    }
    const allowedRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowedRoles && !allowedRoles.includes(request.user!.role)) {
      throw new ForbiddenException(APP_MESSAGES.forbidden);
    }
    return true;
  }
}

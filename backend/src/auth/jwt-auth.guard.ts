import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_MESSAGES } from '../common/constants';

export interface JwtUser {
  sub: string;
  role: string;
  name: string;
}

/**
 * 保留现有 JWT 登录与令牌风格：
 * Authorization: Bearer <token>，校验通过后把用户信息挂到 request.user
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: JwtUser;
    }>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(APP_MESSAGES.unauthorized);
    }
    try {
      request.user = this.jwtService.verify<JwtUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException(APP_MESSAGES.unauthorized);
    }
  }
}

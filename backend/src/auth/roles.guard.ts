import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { APP_MESSAGES } from '../common/constants';
import type { JwtUser } from './jwt-auth.guard';

export const ROLES_KEY = 'allowed_roles';

/** 标注接口允许访问的角色，与 JwtAuthGuard 配合使用 */
export const AllowedRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const roles = Reflect.getMetadata(ROLES_KEY, context.getHandler()) as string[] | undefined;
    if (!roles || roles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user: JwtUser }>();
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenException(APP_MESSAGES.forbidden);
    }
    return true;
  }
}

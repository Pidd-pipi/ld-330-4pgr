import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * 标注接口允许访问的角色；不标注时只校验登录态。
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

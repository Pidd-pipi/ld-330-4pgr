import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUser } from './jwt-auth.guard';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): JwtUser => {
  return context.switchToHttp().getRequest<{ user: JwtUser }>().user;
});

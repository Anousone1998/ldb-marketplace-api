import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Socket } from 'socket.io';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * Injects the authenticated employee (HTTP or WebSocket).
 * Usage: `@CurrentUser() user: AuthUser` or `@CurrentUser('userId') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    let user: AuthUser | undefined;

    if (ctx.getType() === 'ws') {
      user = ctx.switchToWs().getClient<Socket>().data?.user as AuthUser | undefined;
    } else {
      user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    }

    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return field ? user[field] : user;
  },
);

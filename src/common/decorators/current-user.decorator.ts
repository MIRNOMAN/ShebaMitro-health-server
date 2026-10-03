import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Custom decorator to extract the authenticated user from the request.
 * Optionally pass a property name to pluck a single field.
 *
 * @example
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentUser() user: User) { ... }
 *
 * @Get('id')
 * getId(@CurrentUser('id') userId: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as Record<string, unknown> | undefined;

    return data ? user?.[data] : user;
  },
);

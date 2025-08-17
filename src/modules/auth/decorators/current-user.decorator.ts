import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentUser Decorator - Extracts authenticated user from request
 *
 * This decorator:
 * - Extracts user information from the request context
 * - Provides type-safe access to authenticated user data
 * - Works with JWT authentication guard
 *
 * Usage:
 * @Get()
 * async getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * @param data Optional property to extract from user object
 * @param ctx Execution context
 * @returns User object or specific user property
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // If a specific property is requested, return that property
    if (data && user) {
      return user[data];
    }

    // Return the entire user object
    return user;
  },
);

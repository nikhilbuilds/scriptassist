import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// Usage in controller:
// @Get('me/tasks')
// async getMyTasks(@CurrentUser() user: any) {
//   console.log('User ID:', user.id);
//   console.log('User Email:', user.email);
//   console.log('User Role:', user.role);
//   return { user };
// }

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ErrorCode, forbid } from '../errors';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      forbid(ErrorCode.AUTH_REQUIRED);
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some(role => user.role === role);

    if (!hasRole) {
      forbid(ErrorCode.FORBIDDEN_INSUFFICIENT_PERMISSIONS);
    }

    return true;
  }
}

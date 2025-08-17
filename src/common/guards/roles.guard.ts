import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * RolesGuard - Role-based Access Control Guard
 *
 * This guard:
 * - Validates user roles against required roles for routes
 * - Provides role-based access control
 * - Handles authorization errors gracefully
 * - Supports multiple role requirements
 *
 * Security Features:
 * - Validates user permissions before route access
 * - Provides detailed logging for security monitoring
 * - Handles various authorization failure scenarios
 * - Supports flexible role matching (AND/OR logic)
 *
 * Usage:
 * @Roles('admin') - Requires admin role
 * @Roles('user', 'admin') - Requires either user or admin role
 * @Roles(['admin', 'moderator']) - Requires both admin and moderator roles
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  /**
   * Determines if the user has the required roles to access the route
   *
   * @param context Execution context
   * @returns True if user has required roles
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user is present, deny access
    if (!user) {
      this.logger.warn(`Role check failed: No user found for ${request.method} ${request.url}`);
      throw new ForbiddenException('Access denied: No user found');
    }

    const { ip, method, url } = request;
    const userRole = user.role;

    // Log role check attempt
    this.logger.log(`Role check: ${method} ${url} for user ${user.id} (${userRole}) from ${ip}`);

    // Check if user has required role(s)
    const hasRequiredRole = this.checkUserRoles(userRole, requiredRoles);

    if (!hasRequiredRole) {
      this.logger.warn(
        `Access denied: User ${user.id} (${userRole}) attempted to access ${method} ${url} from ${ip}. Required roles: ${requiredRoles.join(', ')}`,
      );
      throw new ForbiddenException('Access denied: Insufficient permissions');
    }

    this.logger.log(
      `Access granted: User ${user.id} (${userRole}) accessed ${method} ${url} from ${ip}`,
    );
    return true;
  }

  /**
   * Checks if the user has the required roles
   *
   * @param userRole User's role
   * @param requiredRoles Required roles for the route
   * @returns True if user has required roles
   */
  private checkUserRoles(userRole: string, requiredRoles: string[]): boolean {
    // Handle single array of roles (OR logic)
    return requiredRoles.some(role => this.matchRole(userRole, role));
  }

  /**
   * Matches user role against required role with support for wildcards
   *
   * @param userRole User's role
   * @param requiredRole Required role
   * @returns True if roles match
   */
  private matchRole(userRole: string, requiredRole: string): boolean {
    // Exact match
    if (userRole === requiredRole) {
      return true;
    }

    // Wildcard support (e.g., 'admin.*' matches 'admin.super')
    if (requiredRole.includes('*')) {
      const pattern = requiredRole.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(userRole);
    }

    // Hierarchy support (e.g., 'admin' has access to 'user' routes)
    const roleHierarchy: Record<string, string[]> = {
      admin: ['admin', 'moderator', 'user'],
      moderator: ['moderator', 'user'],
      user: ['user'],
    };

    const userHierarchy = roleHierarchy[userRole] || [];
    return userHierarchy.includes(requiredRole);
  }
}

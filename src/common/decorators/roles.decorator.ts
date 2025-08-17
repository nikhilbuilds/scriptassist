import { SetMetadata } from '@nestjs/common';

/**
 * Roles Decorator - Role-based Access Control Metadata
 *
 * This decorator:
 * - Sets metadata for required roles on routes
 * - Supports single role, multiple roles, or role groups
 * - Works with RolesGuard for access control
 *
 * Usage Examples:
 * @Roles('admin') - Requires admin role
 * @Roles('user', 'admin') - Requires either user or admin role
 * @Roles(['admin', 'moderator']) - Requires both admin and moderator roles
 * @Roles(['admin'], ['moderator']) - Requires either admin OR moderator role
 *
 * @param roles Required roles for the route
 * @returns Metadata decorator
 */
export const Roles = (...roles: (string | string[])[]) => SetMetadata('roles', roles);

/**
 * Public Decorator - Marks route as publicly accessible
 *
 * This decorator:
 * - Marks routes that don't require authentication
 * - Bypasses JWT authentication guard
 * - Useful for login, register, and public API endpoints
 *
 * @returns Metadata decorator
 */
export const Public = () => SetMetadata('isPublic', true);

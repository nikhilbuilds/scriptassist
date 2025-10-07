import { User } from '../entities/user.entity';
import type { PublicUser } from '../types/user-public.type';
import { UserRole } from '../enum/user-role.enum';

/**
 * Converts a User entity to PublicUser by removing sensitive fields
 * Ensures password and other sensitive data are never exposed in API responses or cache
 *
 * @param user - The full User entity from the database
 * @returns PublicUser object without sensitive fields (password)
 *
 * @example
 * const user = await repository.findById(id);
 * const publicUser = toPublicUser(user);
 * // publicUser = { id, email, name, role, createdAt, updatedAt }
 * // No password field
 */
export function toPublicUser(user: User): PublicUser {
  const { password, ...publicUser } = user;
  return publicUser;
}

/**
 * Converts an array of User entities to PublicUser array
 * Batch version of toPublicUser for efficient array transformations
 *
 * @param users - Array of User entities
 * @returns Array of PublicUser objects
 */
export function toPublicUsers(users: User[]): PublicUser[] {
  return users.map(toPublicUser);
}

/**
 * Checks if a user has a specific role
 *
 * @param user - The user to check
 * @param role - The role to check for
 * @returns true if user has the role
 */
export function hasRole(user: User | PublicUser, role: string): boolean {
  return user.role === role;
}

/**
 * Checks if a user has any of the specified roles
 *
 * @param user - The user to check
 * @param roles - Array of roles to check
 * @returns true if user has any of the roles
 */
export function hasAnyRole(user: User | PublicUser, roles: string[]): boolean {
  return roles.includes(user.role);
}

/**
 * Checks if a role is admin or super-admin
 * Useful for privilege checks and conditional logic
 *
 * @param role - The role to check
 * @returns true if role is admin or super-admin
 *
 * @example
 * if (isAdminOrSuperAdmin(currentUser.role)) {
 *   // Allow access to global data
 * }
 */
export function isAdminOrSuperAdmin(role: string): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
}

/**
 * Checks if a role is a regular user (not admin/super-admin)
 *
 * @param role - The role to check
 * @returns true if role is a regular user
 */
export function isRegularUser(role: string): boolean {
  return role === UserRole.USER;
}

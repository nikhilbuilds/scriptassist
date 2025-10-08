import { ErrorCode } from './error-codes';

/**
 * Centralized error messages mapped to error codes
 * This allows for easy maintenance and i18n support in the future
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Authentication errors
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCode.AUTH_TOKEN_INVALID_TYPE]: 'Invalid token type',
  [ErrorCode.AUTH_USER_NOT_FOUND]: 'User not found',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Invalid or expired refresh token',
  [ErrorCode.AUTH_REQUIRED]: 'User not authenticated',

  // User errors
  [ErrorCode.USER_NOT_FOUND]: 'User not found',
  [ErrorCode.USER_SELF_VIEW_ONLY]: 'You can only view your own profile',
  [ErrorCode.USER_SELF_UPDATE_ONLY]: 'You can only update your own profile',
  [ErrorCode.USER_ROLE_CHANGE_FORBIDDEN]: 'You cannot change your own role',
  [ErrorCode.USER_ROLE_SUPER_ADMIN_FORBIDDEN]: 'You cannot change your own role to super admin',
  [ErrorCode.USER_EMAIL_ALREADY_EXISTS]: 'Email already exists',
  [ErrorCode.USER_PASSWORD_INVALID]: 'Invalid password',
  [ErrorCode.USER_EMAIL_VERIFICATION_NOT_IMPLEMENTED]:
    'Email verification flow not fully implemented. Please contact an administrator to change your email.',

  // Task errors
  [ErrorCode.TASK_NOT_FOUND]: 'Task not found',
  [ErrorCode.TASK_NOT_OWNED]: 'You do not have permission to access this task',
  [ErrorCode.TASKS_NOT_FOUND]: 'Some tasks were not found',
  [ErrorCode.TASKS_DELETE_PERMISSION_DENIED]:
    'You do not have permission to delete some of these tasks',

  // Authorization errors
  [ErrorCode.FORBIDDEN_INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions',

  // Validation errors
  [ErrorCode.VALIDATION_FAILED]: 'Validation failed',
};

/**
 * Get error message with optional dynamic parameters
 * @param code Error code
 * @param params Optional parameters for message interpolation
 */
export function getErrorMessage(code: ErrorCode, params?: Record<string, any>): string {
  let message = ERROR_MESSAGES[code];

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, String(value));
    });
  }

  return message;
}

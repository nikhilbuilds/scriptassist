import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

/**
 * JwtAuthGuard - JWT Authentication Guard
 *
 * This guard:
 * - Validates JWT tokens from Authorization header
 * - Provides user context for authenticated requests
 * - Handles authentication errors gracefully
 * - Supports optional authentication for public routes
 *
 * Security Features:
 * - Validates token signature and expiration
 * - Provides detailed logging for security monitoring
 * - Handles various authentication failure scenarios
 * - Supports role-based access control integration
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Determines if the route requires authentication
   *
   * @param context Execution context
   * @returns True if authentication is required
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  /**
   * Handles successful authentication
   *
   * @param user Authenticated user
   * @param info Additional authentication info
   * @param context Execution context
   * @returns User object
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const { ip, method, url } = request;

    // Log authentication attempts for security monitoring
    this.logger.log(`Authentication attempt: ${method} ${url} from ${ip}`);

    if (err || !user) {
      // Log authentication failures
      this.logger.warn(
        `Authentication failed: ${method} ${url} from ${ip} - ${info?.message || 'No token provided'}`,
      );

      // Don't expose internal error details to clients
      throw new UnauthorizedException('Authentication required');
    }

    // Log successful authentication
    this.logger.log(`Authentication successful: ${method} ${url} for user ${user.id} from ${ip}`);

    return user;
  }
}

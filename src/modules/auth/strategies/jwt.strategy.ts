import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

/**
 * JwtStrategy - Handles JWT token validation and user authentication
 *
 * This strategy:
 * - Extracts JWT tokens from Authorization header
 * - Validates token signatures and expiration
 * - Retrieves user information from the database
 * - Provides user context for authenticated requests
 *
 * Security Notes:
 * - Uses ConfigService for secure secret management
 * - Validates user existence in database
 * - Returns minimal user information for security
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Use environment variable directly for JWT secret
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  /**
   * Validates JWT payload and returns user information
   *
   * @param payload JWT token payload containing user ID
   * @returns User information for authenticated requests
   * @throws UnauthorizedException if user not found
   */
  async validate(payload: any) {
    const user = await this.usersService.findOne(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return minimal user information for security
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}

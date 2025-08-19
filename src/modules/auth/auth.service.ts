import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto, RevokeTokenDto } from './dto/refresh-token.dto';
import { JWT_CONSTANTS } from '../../config/jwt.config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find the user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('No account found with that email');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Wrong password - try again');
    }

    // Generate tokens
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(tokenPayload, {
      expiresIn: JWT_CONSTANTS.ACCESS_TOKEN_EXPIRES_IN,
    });
    
    // Generate refresh token
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new UnauthorizedException('Someone already has that email address');
    }

    // Create the new user
    const newUser = await this.usersService.create(registerDto);

    // Generate tokens for immediate login
    const accessToken = this.jwtService.sign(
      { sub: newUser.id },
      {
        expiresIn: JWT_CONSTANTS.ACCESS_TOKEN_EXPIRES_IN,
      },
    );
    const refreshToken = await this.generateRefreshToken(newUser.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    };
  }

  async validateUser(
    userId: string,
  ): Promise<{ id: string; email: string; name: string; role: string } | null> {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    // Verify the refresh token
    const payload = this.verifyRefreshToken(refreshToken);

    if (payload.type !== JWT_CONSTANTS.REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid token type');
    }

    // Get user from database
    const user = await this.usersService.findOne(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate new tokens
    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = this.jwtService.sign(accessPayload, {
      expiresIn: JWT_CONSTANTS.ACCESS_TOKEN_EXPIRES_IN,
    });
    const newRefreshToken = this.generateRefreshToken(user.id);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async revokeToken(revokeTokenDto: RevokeTokenDto) {
    // With JWT refresh tokens, we can't revoke individual tokens
    // This would require changing the JWT secret which affects all users
    // For now, we'll just validate the token and return success
    const { refreshToken } = revokeTokenDto;

    try {
      this.verifyRefreshToken(refreshToken);
      return {
        message: 'Token validation successful (Note: JWT tokens cannot be individually revoked)',
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private generateRefreshToken(userId: string): string {
    const payload = {
      sub: userId,
      type: JWT_CONSTANTS.REFRESH_TOKEN_TYPE,
    };

    return this.jwtService.sign(payload, {
      expiresIn: JWT_CONSTANTS.REFRESH_TOKEN_EXPIRES_IN,
    });
  }

  private verifyRefreshToken(token: string): {
    sub: string;
    type: string;
    iat: number;
    exp: number;
  } {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

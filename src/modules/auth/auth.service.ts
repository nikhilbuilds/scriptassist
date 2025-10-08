import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@modules/users/enum/user-role.enum';
import { ErrorCode, unauthorized, conflict } from '../../common/errors';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      unauthorized(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      unauthorized(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      conflict(ErrorCode.USER_EMAIL_ALREADY_EXISTS);
    }

    const user = await this.usersService.create({ ...registerDto, role: UserRole.USER });

    const tokens = this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private generateTokens(user: { id: string; email: string; role: string }): {
    access_token: string;
    refresh_token: string;
  } {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '15m',
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      {
        expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '7d',
      },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.type !== 'refresh') {
        unauthorized(ErrorCode.AUTH_TOKEN_INVALID_TYPE);
      }

      const user = await this.usersService.findOne(payload.sub, {
        id: payload.sub,
        role: 'user',
      });

      if (!user) {
        unauthorized(ErrorCode.AUTH_USER_NOT_FOUND);
      }

      return this.generateTokens({
        id: user.id,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);
    }
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.usersService.findOne(userId, { id: userId, role: 'user' });

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    return true;
  }
}

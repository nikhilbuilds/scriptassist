import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import jwtConfig from '@config/jwt.config';
import { RefreshDto } from './dto/refreshDto';
import { User } from '@modules/users/entities/user.entity';

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
      throw new UnauthorizedException('Invalid email');
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    return {
      access_token: this.generateToken(user),
      refresh_token: this.generateRefreshToken(user),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refreshAccessToken(refresh: RefreshDto) {
    const payload = this.jwtService.verify(refresh.token, {
      secret: jwtConfig().refreshSecret,
    });

    const user = this.usersService.findOne(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const newAccessToken = this.jwtService.sign({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    });

    return {
      access_token: newAccessToken,
    };
  }

  async register(registerDto: RegisterDto) {
    try {
      const user = await this.usersService.create(registerDto);

      const token = this.generateToken(user);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
        refreshToken: this.generateRefreshToken(user),
      };
    } catch (error) {
      if ((error as any).constraint === 'users_email_key') {
        throw new UnauthorizedException('Email already exists');
      } else {
        throw error;
      }
    }
  }

  private generateToken(user: User) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private generateRefreshToken(user: User) {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        expiresIn: jwtConfig().refreshExpiresIn,
        secret: jwtConfig().refreshSecret,
      },
    );
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      return false;
    }
    return requiredRoles.includes(user.role);
  }
}

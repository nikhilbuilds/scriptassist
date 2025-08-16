import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CacheService } from '../../common/services/cache.service';
import { 
  LoginResponse, 
  RegisterResponse, 
  RefreshTokenResponse, 
  LogoutResponse,
  JwtPayload,
  LockoutData 
} from './interfaces/auth.interface';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { email, password } = loginDto;

    const lockoutKey = `lockout:${email}`;
const lockoutDataStr = await this.cacheService.get(lockoutKey);

    if (typeof lockoutDataStr === 'string' && lockoutDataStr) {
      const { attempts, lockedUntil }: LockoutData = JSON.parse(lockoutDataStr);
      if (attempts >= this.MAX_LOGIN_ATTEMPTS && Date.now() < lockedUntil) {
        const remainingTime = Math.ceil((lockedUntil - Date.now()) / 1000 / 60);
        throw new UnauthorizedException(`Account temporarily locked. Try again in ${remainingTime} minutes.`);
      }
    }

    const user: User | null = await this.usersService.findByEmail(email);
    
    if (!user) {
      await this.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
      await this.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.cacheService.delete(lockoutKey);

    const { accessToken, refreshToken } = await this.generateTokens(user);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.cacheService.set(
      `refresh_token:${user.id}`,
      refreshTokenHash,
      7 * 24 * 60 * 60
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto): Promise<RegisterResponse> {
    this.validatePasswordStrength(registerDto.password);

    const existingUser: User | null = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) throw new ConflictException('Email already exists');

    const user: User = await this.usersService.create(registerDto);

    const { accessToken, refreshToken } = await this.generateTokens(user);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.cacheService.set(
      `refresh_token:${user.id}`,
      refreshTokenHash,
      7 * 24 * 60 * 60
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      });

      const user: User | null = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException('Invalid refresh token');

      const storedTokenHash = await this.cacheService.get(`refresh_token:${user.id}`);
      if (typeof storedTokenHash !== 'string' || !storedTokenHash) throw new UnauthorizedException('Refresh token has been revoked');

      const isValid = await bcrypt.compare(refreshToken, storedTokenHash);
      if (!isValid) throw new UnauthorizedException('Invalid refresh token');

      const { accessToken, refreshToken: newRefreshToken } = await this.generateTokens(user);
      const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
      await this.cacheService.set(
        `refresh_token:${user.id}`,
        newRefreshTokenHash,
        7 * 24 * 60 * 60
      );

      return {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: 3600,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<LogoutResponse> {
    await this.cacheService.delete(`refresh_token:${userId}`);
    return { message: 'Successfully logged out' };
  }

  async validateUser(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`;
    let userStr = await this.cacheService.get(cacheKey);
    let user: User | null = null;

    if (typeof userStr === 'string' && userStr) {
      user = JSON.parse(userStr);
    } else {
      user = await this.usersService.findOne(userId);
      if (user) await this.cacheService.set(cacheKey, JSON.stringify(user), 300);
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    const user = await this.validateUser(userId);
    if (!user) return false;
    return requiredRoles.includes(user.role);
  }

  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: user.id, email: user.email, role: user.role, type: 'access' };
    const refreshPayload = { sub: user.id, type: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '1h',
        secret: process.env.JWT_SECRET || 'your-secret-key',
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: '7d',
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async recordFailedAttempt(email: string) {
    const lockoutKey = `lockout:${email}`;
    const existingData = await this.cacheService.get(lockoutKey);

    let attempts = 1;
    let lockedUntil = 0;

    if (typeof existingData === 'string' && existingData) {
      const data: LockoutData = JSON.parse(existingData);
      attempts = data.attempts + 1;
      if (attempts >= this.MAX_LOGIN_ATTEMPTS) lockedUntil = Date.now() + this.LOCKOUT_DURATION;
    }

    await this.cacheService.set(
      lockoutKey,
      JSON.stringify({ attempts, lockedUntil }),
      this.LOCKOUT_DURATION / 1000
    );
  }

  private validatePasswordStrength(password: string) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) throw new BadRequestException('Password must be at least 8 characters long');
    if (!hasUpperCase) throw new BadRequestException('Password must contain at least one uppercase letter');
    if (!hasLowerCase) throw new BadRequestException('Password must contain at least one lowercase letter');
    if (!hasNumbers) throw new BadRequestException('Password must contain at least one number');
    if (!hasSpecialChar) throw new BadRequestException('Password must contain at least one special character');
  }
}

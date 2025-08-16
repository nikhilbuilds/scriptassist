import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RedisCacheService } from '../../../common/services/redis-cache.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private cacheService: RedisCacheService,
    private jwtService: JwtService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      throw new UnauthorizedException('No authorization header');
    }
    const refreshToken = authHeader.replace('Bearer', '').trim();
    
    // Check if refresh token is in cache (not revoked)
    const isTokenValid = await this.cacheService.get(`refresh_token:${payload.sub}`);
    if (!isTokenValid) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Verify the token hash matches
    const tokenHash = await this.cacheService.get(`refresh_token_hash:${payload.sub}`);
    if (!tokenHash || tokenHash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is expired
    if (payload.exp * 1000 < Date.now()) {
      // Remove expired token from cache
      await this.cacheService.delete(`refresh_token:${payload.sub}`);
      await this.cacheService.delete(`refresh_token_hash:${payload.sub}`);
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Implement token rotation - invalidate current refresh token
    await this.cacheService.delete(`refresh_token:${payload.sub}`);
    await this.cacheService.delete(`refresh_token_hash:${payload.sub}`);

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken, // Pass for rotation
    };
  }

  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

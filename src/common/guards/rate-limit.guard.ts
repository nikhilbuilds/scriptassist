import { RATE_LIMIT_KEY, RateLimitOptions } from '@common/decorators/rate-limit.decorator';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { hash } from 'crypto';
import { CacheService } from 'src/cache/cache.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;

    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) as RateLimitOptions;
    return this.handleRateLimit(this.hashIp(ip), rateLimitOptions);
  }

  private hashIp(ip: string): string {
    return hash('sha256', ip, 'hex');
  }

  private async handleRateLimit(
    hashedIp: string,
    rateLimitOptions: RateLimitOptions,
  ): Promise<boolean> {
    const { limit, windowMs } = rateLimitOptions;
    const key = `rate-limit:ip:${windowMs}:${hashedIp}`;
    const currentRequests = (await this.cacheService.get(key)) as number;

    if (currentRequests === null) {
      await this.cacheService.set(key, 0, windowMs / 1000);
      return true;
    } else if (currentRequests < limit) {
      await this.cacheService.increment(key);
      return true;
    } else {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

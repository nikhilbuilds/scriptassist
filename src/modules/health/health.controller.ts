import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheckService, HealthCheck, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Queue } from 'bullmq';
import { CacheService } from 'src/cache/cache.service';

@ApiTags('health')
@Controller('health')
@UseGuards(RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private cache: CacheService,
    @InjectQueue('task-processing')
    private queue: Queue,
  ) {}

  @Get()
  @HealthCheck()
  checkApiServer() {
    return this.health.check([
      () => ({
        apiServer: {
          status: 'up',
        },
      }),
    ]);
  }

  @Get('postgres')
  @HealthCheck()
  checkPostgres() {
    return this.health.check([() => this.db.pingCheck('postgres')]);
  }

  @Get('cache')
  @HealthCheck()
  checkRedis() {
    return this.health.check([() => this.cache.pingCheck()]);
  }

  @Get('queue')
  @HealthCheck()
  checkBullMQ() {
    return this.health.check([
      async () => {
        try {
          await this.queue.getActiveCount();
          return { queue: { status: 'up' } };
        } catch (error) {
          this.logger.error('Queue ping failed', error);
          return { queue: { status: 'down' } };
        }
      },
    ]);
  }
}

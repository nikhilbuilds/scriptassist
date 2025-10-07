import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const client = await this.taskQueue.client;

      const pong = await client.ping();

      if (pong !== 'PONG') {
        throw new Error('Redis ping failed');
      }

      // Get queue stats
      const jobCounts = await this.taskQueue.getJobCounts();

      const result = this.getStatus(key, true, {
        connected: true,
        queue: 'task-processing',
        waiting: jobCounts.waiting || 0,
        active: jobCounts.active || 0,
        completed: jobCounts.completed || 0,
        failed: jobCounts.failed || 0,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HealthCheckError(
        `Redis health check failed: ${errorMessage}`,
        this.getStatus(key, false, {
          connected: false,
          error: errorMessage,
        }),
      );
    }
  }
}

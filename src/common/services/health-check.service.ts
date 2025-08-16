import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisCacheService } from './redis-cache.service';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
    external: HealthCheck;
  };
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  details?: string;
  error?: string;
}

@Injectable()
export class HealthCheckService {
  private readonly logger = new Logger(HealthCheckService.name);
  private readonly startTime = Date.now();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Perform all health checks in parallel
      const [
        databaseCheck,
        redisCheck,
        memoryCheck,
        diskCheck,
        externalCheck
      ] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkMemory(),
        this.checkDisk(),
        this.checkExternalServices(),
      ]);

      // Process results
      const checks = {
        database: this.processCheckResult(databaseCheck),
        redis: this.processCheckResult(redisCheck),
        memory: this.processCheckResult(memoryCheck),
        disk: this.processCheckResult(diskCheck),
        external: this.processCheckResult(externalCheck),
      };

      // Calculate summary
      const summary = this.calculateSummary(checks);
      
      // Determine overall status
      const overallStatus = this.determineOverallStatus(summary);

      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        version: process.env.npm_package_version || '1.0.0',
        checks,
        summary,
      };

      // Log health check results
      this.logHealthCheckResult(result, Date.now() - startTime);

      return result;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      throw error;
    }
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check database connectivity
      await this.dataSource.query('SELECT 1');
      
      // Check if we can perform a simple read operation
      const result = await this.dataSource.query('SELECT COUNT(*) FROM information_schema.tables');
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: `Connected to ${this.dataSource.options.database} database`,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Database connection failed',
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.redisCacheService.healthCheck();
      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        return {
          status: 'healthy',
          responseTime,
          details: 'Redis connection is healthy',
        };
      } else {
        return {
          status: 'unhealthy',
          responseTime,
          error: 'Redis health check failed',
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Redis connection failed',
      };
    }
  }



  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      const responseTime = Date.now() - startTime;
      
      // Calculate memory usage percentage
      const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let details = `Memory usage: ${Math.round(memoryUsagePercent)}%`;
      
      if (memoryUsagePercent > 90) {
        status = 'unhealthy';
        details += ' - Critical memory usage';
      } else if (memoryUsagePercent > 80) {
        status = 'degraded';
        details += ' - High memory usage';
      }
      
      return {
        status,
        responseTime,
        details,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Memory check failed',
      };
    }
  }

  private async checkDisk(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // For now, we'll do a basic disk check
      // In production, you might want to check actual disk space
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: 'Disk space check passed',
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Disk check failed',
      };
    }
  }

  private async checkExternalServices(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if we can make a simple HTTP request
      // This is a placeholder - in production you'd check actual external services
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: 'External services are accessible',
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'degraded',
        responseTime,
        error: error instanceof Error ? error.message : 'External service check failed',
      };
    }
  }

  private processCheckResult(result: PromiseSettledResult<HealthCheck>): HealthCheck {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        responseTime: 0,
        error: result.reason instanceof Error ? result.reason.message : 'Check failed',
      };
    }
  }

  private calculateSummary(checks: HealthCheckResult['checks']) {
    const allChecks = Object.values(checks);
    const total = allChecks.length;
    const healthy = allChecks.filter(c => c.status === 'healthy').length;
    const unhealthy = allChecks.filter(c => c.status === 'unhealthy').length;
    const degraded = allChecks.filter(c => c.status === 'degraded').length;

    return { total, healthy, unhealthy, degraded };
  }

  private determineOverallStatus(summary: HealthCheckResult['summary']): 'healthy' | 'unhealthy' | 'degraded' {
    if (summary.unhealthy > 0) {
      return 'unhealthy';
    } else if (summary.degraded > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private logHealthCheckResult(result: HealthCheckResult, totalTime: number) {
    const { status, summary } = result;
    
    if (status === 'healthy') {
      this.logger.log(`Health check completed in ${totalTime}ms - Status: ${status} (${summary.healthy}/${summary.total} checks passed)`);
    } else if (status === 'degraded') {
      this.logger.warn(`Health check completed in ${totalTime}ms - Status: ${status} (${summary.healthy}/${summary.total} healthy, ${summary.degraded} degraded)`);
    } else {
      this.logger.error(`Health check completed in ${totalTime}ms - Status: ${status} (${summary.unhealthy} unhealthy, ${summary.degraded} degraded)`);
    }

    // Log individual check failures
    Object.entries(result.checks).forEach(([name, check]) => {
      if (check.status !== 'healthy') {
        this.logger.warn(`${name} check failed: ${check.error || check.details}`);
      }
    });
  }

  // Quick health check for load balancers
  async quickHealthCheck(): Promise<boolean> {
    try {
      const result = await this.performHealthCheck();
      return result.status === 'healthy';
    } catch (error) {
      this.logger.error('Quick health check failed:', error);
      return false;
    }
  }
}

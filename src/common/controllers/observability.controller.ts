import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HealthCheckService } from '../services/health-check.service';
import { ResilienceService } from '../services/resilience.service';
import { EnhancedLoggingService } from '../services/enhanced-logging.service';
import { PerformanceMonitorService } from '../services/performance-monitor.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';

@ApiTags('observability')
@Controller('observability')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ObservabilityController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly resilienceService: ResilienceService,
    private readonly enhancedLoggingService: EnhancedLoggingService,
    private readonly performanceMonitorService: PerformanceMonitorService,
  ) {}

  @Get('health')
  @ApiOperation({ 
    summary: 'Comprehensive system health check',
    description: 'Performs a full health check of all system components including database, Redis, queues, memory, and external services.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System health status retrieved successfully'
  })
  async getHealthCheck() {
    return this.healthCheckService.performHealthCheck();
  }

  @Get('health/ready')
  @ApiOperation({ 
    summary: 'Readiness probe',
    description: 'Quick health check for load balancers and Kubernetes readiness probes.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System is ready to serve traffic'
  })
  async getReadiness() {
    const isHealthy = await this.healthCheckService.quickHealthCheck();
    
    if (isHealthy) {
      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } else {
      throw new Error('System not ready');
    }
  }

  @Get('health/live')
  @ApiOperation({ 
    summary: 'Liveness probe',
    description: 'Basic liveness check for Kubernetes liveness probes.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Application is alive and running'
  })
  async getLiveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('resilience')
  @ApiOperation({ 
    summary: 'Circuit breaker and resilience status',
    description: 'Get the current status of all circuit breakers and resilience patterns.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resilience status retrieved successfully'
  })
  async getResilienceStatus() {
    return {
      timestamp: new Date().toISOString(),
      circuitBreakers: this.resilienceService.getCircuitBreakerStatus(),
    };
  }

  @Get('logs')
  @ApiOperation({ 
    summary: 'Logging metrics and statistics',
    description: 'Get comprehensive logging metrics including log counts by level, operation, and error rates.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Logging metrics retrieved successfully'
  })
  async getLogMetrics() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.enhancedLoggingService.getLogMetrics(),
    };
  }

  @Get('logs/recent')
  @ApiOperation({ 
    summary: 'Recent log entries',
    description: 'Get recent log entries for debugging and monitoring purposes.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Recent logs retrieved successfully'
  })
  async getRecentLogs() {
    return {
      timestamp: new Date().toISOString(),
      logs: this.enhancedLoggingService.getRecentLogs(100),
    };
  }

  @Get('performance')
  @ApiOperation({ 
    summary: 'Performance metrics',
    description: 'Get comprehensive performance metrics including system resources, database performance, and cache statistics.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance metrics retrieved successfully'
  })
  async getPerformanceMetrics() {
    return {
      timestamp: new Date().toISOString(),
      metrics: await this.performanceMonitorService.getPerformanceReport(),
    };
  }

  @Get('performance/queries')
  @ApiOperation({ 
    summary: 'Database query performance',
    description: 'Get detailed database query performance statistics including slow queries and execution counts.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Query performance data retrieved successfully'
  })
  async getQueryPerformance() {
    return {
      timestamp: new Date().toISOString(),
      queries: this.performanceMonitorService.getQueryStats(),
    };
  }

  @Get('performance/cache')
  @ApiOperation({ 
    summary: 'Cache performance',
    description: 'Get cache performance statistics including hit rates, miss rates, and Redis statistics.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cache performance data retrieved successfully'
  })
  async getCachePerformance() {
    return {
      timestamp: new Date().toISOString(),
      cache: this.performanceMonitorService.getCacheStats(),
    };
  }

  @Get('summary')
  @ApiOperation({ 
    summary: 'System observability summary',
    description: 'Get a comprehensive summary of all observability data including health, resilience, logging, and performance.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Observability summary retrieved successfully'
  })
  async getObservabilitySummary() {
    const [
      health,
      resilience,
      logs,
      performance
    ] = await Promise.all([
      this.healthCheckService.performHealthCheck(),
      this.resilienceService.getCircuitBreakerStatus(),
      this.enhancedLoggingService.getLogMetrics(),
      this.performanceMonitorService.getPerformanceReport(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        overallHealth: health.status,
        healthyServices: health.summary.healthy,
        totalServices: health.summary.total,
        circuitBreakers: Object.keys(resilience).length,
        openCircuitBreakers: Object.values(resilience).filter(cb => cb.state === 'OPEN').length,
        totalLogs: logs.totalLogs,
        errorRate: logs.errorRate,
        averageResponseTime: logs.averageResponseTime,
        cacheHitRate: performance.cache.hitRate,
        databaseQueries: performance.queries.totalQueries,
        slowQueries: performance.queries.slowQueries,
      },
      details: {
        health,
        resilience,
        logs,
        performance,
      },
    };
  }
}

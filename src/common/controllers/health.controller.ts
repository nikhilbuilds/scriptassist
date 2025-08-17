import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheckService, HealthCheckResult } from '../services/health-check.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Comprehensive health check',
    description: 'Performs a full health check of all system components including database, Redis, queues, memory, and external services.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System is healthy',
    schema: {
      example: {
        status: 'healthy',
        timestamp: '2023-12-01T12:00:00.000Z',
        uptime: 3600000,
        version: '1.0.0',
        checks: {
          database: {
            status: 'healthy',
            responseTime: 15,
            details: 'Connected to taskflow database'
          },
          redis: {
            status: 'healthy',
            responseTime: 5,
            details: 'Redis connection is healthy'
          },
          queues: {
            status: 'healthy',
            responseTime: 8,
            details: 'Queue has 0 waiting, 2 active, 150 completed jobs'
          },
          memory: {
            status: 'healthy',
            responseTime: 1,
            details: 'Memory usage: 45%'
          },
          disk: {
            status: 'healthy',
            responseTime: 1,
            details: 'Disk space check passed'
          },
          external: {
            status: 'healthy',
            responseTime: 25,
            details: 'External services are accessible'
          }
        },
        summary: {
          total: 6,
          healthy: 6,
          unhealthy: 0,
          degraded: 0
        }
      }
    }
  })
  @ApiResponse({ 
    status: 503, 
    description: 'System is unhealthy or degraded',
    schema: {
      example: {
        status: 'unhealthy',
        timestamp: '2023-12-01T12:00:00.000Z',
        uptime: 3600000,
        version: '1.0.0',
        checks: {
          database: {
            status: 'unhealthy',
            responseTime: 5000,
            error: 'Database connection failed'
          },
          redis: {
            status: 'healthy',
            responseTime: 5,
            details: 'Redis connection is healthy'
          }
        },
        summary: {
          total: 6,
          healthy: 1,
          unhealthy: 1,
          degraded: 0
        }
      }
    }
  })
  async getHealthCheck(): Promise<HealthCheckResult> {
    return this.healthCheckService.performHealthCheck();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Readiness probe',
    description: 'Quick health check for load balancers and Kubernetes readiness probes. Returns 200 if system is ready to serve traffic.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System is ready to serve traffic'
  })
  @ApiResponse({ 
    status: 503, 
    description: 'System is not ready to serve traffic'
  })
  async getReadiness(): Promise<{ status: string; timestamp: string }> {
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

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Liveness probe',
    description: 'Basic liveness check for Kubernetes liveness probes. Returns 200 if the application is running.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Application is alive and running'
  })
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('startup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Startup probe',
    description: 'Startup probe for Kubernetes. Returns 200 if the application has finished starting up.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Application has finished starting up'
  })
  async getStartup(): Promise<{ status: string; timestamp: string; uptime: number }> {
    const uptime = process.uptime() * 1000; // Convert to milliseconds
    
    return {
      status: 'started',
      timestamp: new Date().toISOString(),
      uptime,
    };
  }
}

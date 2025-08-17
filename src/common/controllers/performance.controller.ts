import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PerformanceMonitorService } from '../services/performance-monitor.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';

// This guard needs to be implemented or imported from the correct location
class JwtAuthGuard {}

@ApiTags('performance')
@Controller('performance')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@ApiBearerAuth()
export class PerformanceController {
  constructor(
    private readonly performanceMonitor: PerformanceMonitorService,
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved successfully' })
  async getMetrics() {
    return this.performanceMonitor.getPerformanceReport();
  }

  @Get('queries')
  @ApiOperation({ summary: 'Get database query statistics' })
  @ApiResponse({ status: 200, description: 'Query statistics retrieved successfully' })
  getQueryStats() {
    return this.performanceMonitor.getQueryStats();
  }

  @Get('cache')
  @ApiOperation({ summary: 'Get cache performance statistics' })
  @ApiResponse({ status: 200, description: 'Cache statistics retrieved successfully' })
  getCacheStats() {
    return this.performanceMonitor.getCacheStats();
  }
}

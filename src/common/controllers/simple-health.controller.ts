import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RedisRateLimitGuard } from '../guards/redis-rate-limit.guard';

@ApiTags('health')
@Controller('health')
@UseGuards(RedisRateLimitGuard)
export class SimpleHealthController {
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  async checkHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('test-rate-limit')
  @ApiOperation({ summary: 'Test rate limiting endpoint' })
  @ApiResponse({ status: 200, description: 'Rate limit test' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async testRateLimit() {
    return {
      message: 'Rate limit test endpoint',
      timestamp: new Date().toISOString(),
    };
  }
}

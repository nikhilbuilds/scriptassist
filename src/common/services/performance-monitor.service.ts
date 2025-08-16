import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
}

@Injectable()
export class PerformanceMonitorService {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private queryMetrics: QueryMetrics[] = [];
  private cacheMetrics = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
  };

  constructor(private readonly cacheService: RedisCacheService) {}

  // Track database query performance
  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    query?: string
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      const result = await queryFn();
      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const metric: QueryMetrics = {
        query: query || queryName,
        duration,
        timestamp: new Date(),
        success,
        error,
      };

      this.queryMetrics.push(metric);
      
      // Log slow queries
      if (duration > 1000) {
        this.logger.warn(`Slow query detected: ${queryName} took ${duration}ms`);
      }

      // Keep only last 1000 metrics to prevent memory leaks
      if (this.queryMetrics.length > 1000) {
        this.queryMetrics = this.queryMetrics.slice(-1000);
      }
    }
  }

  // Track cache performance
  trackCacheHit(): void {
    this.cacheMetrics.hits++;
    this.cacheMetrics.totalRequests++;
  }

  trackCacheMiss(): void {
    this.cacheMetrics.misses++;
    this.cacheMetrics.totalRequests++;
  }

  // Get performance statistics
  getQueryStats(): {
    totalQueries: number;
    averageDuration: number;
    slowQueries: number;
    errorRate: number;
    recentQueries: QueryMetrics[];
  } {
    const totalQueries = this.queryMetrics.length;
    const successfulQueries = this.queryMetrics.filter(q => q.success);
    const failedQueries = this.queryMetrics.filter(q => !q.success);
    
    const averageDuration = totalQueries > 0 
      ? this.queryMetrics.reduce((sum, q) => sum + q.duration, 0) / totalQueries 
      : 0;

    const slowQueries = this.queryMetrics.filter(q => q.duration > 1000).length;
    const errorRate = totalQueries > 0 ? (failedQueries.length / totalQueries) * 100 : 0;

    return {
      totalQueries,
      averageDuration: Math.round(averageDuration),
      slowQueries,
      errorRate: Math.round(errorRate * 100) / 100,
      recentQueries: this.queryMetrics.slice(-10), // Last 10 queries
    };
  }

  getCacheStats(): CacheMetrics {
    const hitRate = this.cacheMetrics.totalRequests > 0 
      ? (this.cacheMetrics.hits / this.cacheMetrics.totalRequests) * 100 
      : 0;

    return {
      hits: this.cacheMetrics.hits,
      misses: this.cacheMetrics.misses,
      totalRequests: this.cacheMetrics.totalRequests,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  // Get comprehensive performance report
  async getPerformanceReport(): Promise<{
    queries: ReturnType<typeof PerformanceMonitorService.prototype.getQueryStats>;
    cache: CacheMetrics;
    redis: { healthy: boolean };
    timestamp: Date;
  }> {
    const redisHealth = await this.cacheService.healthCheck();

    return {
      queries: this.getQueryStats(),
      cache: this.getCacheStats(),
      redis: { healthy: redisHealth },
      timestamp: new Date(),
    };
  }

  // Reset metrics (useful for testing)
  resetMetrics(): void {
    this.queryMetrics = [];
    this.cacheMetrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
    };
  }
}

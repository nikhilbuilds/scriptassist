import { Injectable, Logger, LogLevel } from '@nestjs/common';

export interface LogContext {
  userId?: string;
  requestId?: string;
  operation?: string;
  resource?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface LogMetrics {
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  logsByOperation: Record<string, number>;
  averageResponseTime: number;
  errorRate: number;
}

@Injectable()
export class EnhancedLoggingService {
  private readonly logger = new Logger(EnhancedLoggingService.name);
  private readonly logs: LogEntry[] = [];
  private readonly maxLogs = 10000; // Keep last 10k logs in memory

  /**
   * Log with context and structured format
   */
  log(level: LogLevel, message: string, context: LogContext = {}, error?: Error): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
      metadata: this.extractMetadata(context),
    };

    // Store log entry
    this.storeLogEntry(logEntry);

    // Format and log using NestJS logger
    const formattedMessage = this.formatLogMessage(logEntry);
    
    switch (level) {
      case 'error':
        this.logger.error(formattedMessage, error?.stack);
        break;
      case 'warn':
        this.logger.warn(formattedMessage);
        break;
      case 'log':
        this.logger.log(formattedMessage);
        break;
      case 'debug':
        this.logger.debug(formattedMessage);
        break;
      case 'verbose':
        this.logger.verbose(formattedMessage);
        break;
    }
  }

  /**
   * Convenience methods for different log levels
   */
  info(message: string, context: LogContext = {}): void {
    this.log('log', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext = {}, error?: Error): void {
    this.log('error', message, context, error);
  }

  debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, context);
  }

  verbose(message: string, context: LogContext = {}): void {
    this.log('verbose', message, context);
  }

  /**
   * Log API request/response with timing
   */
  logApiRequest(
    method: string,
    url: string,
    userId?: string,
    requestId?: string,
    additionalContext: LogContext = {}
  ): () => void {
    const startTime = Date.now();
    const context: LogContext = {
      operation: 'api_request',
      method,
      url,
      userId,
      requestId,
      ...additionalContext,
    };

    this.info(`API Request: ${method} ${url}`, context);

    // Return function to log response
    return () => {
      const duration = Date.now() - startTime;
      this.info(`API Response: ${method} ${url}`, {
        ...context,
        operation: 'api_response',
        duration,
      });
    };
  }

  /**
   * Log database operation with timing
   */
  logDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    context: LogContext = {}
  ): void {
    const logContext: LogContext = {
      operation: 'database',
      table,
      duration,
      ...context,
    };

    if (duration > 1000) {
      this.warn(`Slow database operation: ${operation} on ${table} took ${duration}ms`, logContext);
    } else if (duration > 100) {
      this.info(`Database operation: ${operation} on ${table} took ${duration}ms`, logContext);
    } else {
      this.debug(`Database operation: ${operation} on ${table} took ${duration}ms`, logContext);
    }
  }

  /**
   * Log cache operation
   */
  logCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'delete',
    key: string,
    duration: number,
    context: LogContext = {}
  ): void {
    const logContext: LogContext = {
      operation: 'cache',
      cacheOperation: operation,
      key,
      duration,
      ...context,
    };

    this.debug(`Cache ${operation}: ${key} (${duration}ms)`, logContext);
  }

  /**
   * Log authentication events
   */
  logAuthEvent(
    event: 'login' | 'logout' | 'token_refresh' | 'access_denied',
    userId: string,
    success: boolean,
    context: LogContext = {}
  ): void {
    const logContext: LogContext = {
      operation: 'authentication',
      event,
      userId,
      success,
      ...context,
    };

    if (success) {
      this.info(`Authentication ${event} successful for user ${userId}`, logContext);
    } else {
      this.warn(`Authentication ${event} failed for user ${userId}`, logContext);
    }
  }

  /**
   * Log authorization events
   */
  logAuthorizationEvent(
    userId: string,
    resource: string,
    action: string,
    allowed: boolean,
    context: LogContext = {}
  ): void {
    const logContext: LogContext = {
      operation: 'authorization',
      userId,
      resource,
      action,
      allowed,
      ...context,
    };

    if (allowed) {
      this.debug(`Authorization granted: ${userId} can ${action} on ${resource}`, logContext);
    } else {
      this.warn(`Authorization denied: ${userId} cannot ${action} on ${resource}`, logContext);
    }
  }

  /**
   * Log business events
   */
  logBusinessEvent(
    event: string,
    entityType: string,
    entityId: string,
    userId: string,
    context: LogContext = {}
  ): void {
    const logContext: LogContext = {
      operation: 'business_event',
      event,
      entityType,
      entityId,
      userId,
      ...context,
    };

    this.info(`Business event: ${event} on ${entityType} ${entityId} by user ${userId}`, logContext);
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetric(
    metric: string,
    value: number,
    unit: string,
    context: LogContext = {}
  ): void {
    const logContext: LogContext = {
      operation: 'performance',
      metric,
      value,
      unit,
      ...context,
    };

    this.info(`Performance metric: ${metric} = ${value}${unit}`, logContext);
  }

  /**
   * Get log metrics for monitoring
   */
  getLogMetrics(): LogMetrics {
    const totalLogs = this.logs.length;
    const logsByLevel: Record<LogLevel, number> = {
      error: 0,
      warn: 0,
      log: 0,
      debug: 0,
      verbose: 0,
      fatal: 0,
    };

    const logsByOperation: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let errorCount = 0;

    this.logs.forEach(log => {
      // Count by level
      logsByLevel[log.level]++;

      // Count by operation
      const operation = log.context.operation || 'unknown';
      logsByOperation[operation] = (logsByOperation[operation] || 0) + 1;

      // Calculate response time metrics
      if (log.context.duration) {
        totalResponseTime += log.context.duration;
        responseTimeCount++;
      }

      // Count errors
      if (log.level === 'error') {
        errorCount++;
      }
    });

    return {
      totalLogs,
      logsByLevel,
      logsByOperation,
      averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
      errorRate: totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0,
    };
  }

  /**
   * Get recent logs for debugging
   */
  getRecentLogs(limit: number = 100, level?: LogLevel): LogEntry[] {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    return filteredLogs.slice(-limit);
  }

  /**
   * Search logs by criteria
   */
  searchLogs(criteria: Partial<LogContext>): LogEntry[] {
    return this.logs.filter(log => {
      return Object.entries(criteria).every(([key, value]) => {
        return log.context[key] === value;
      });
    });
  }

  /**
   * Clear old logs to prevent memory issues
   */
  clearOldLogs(): void {
    if (this.logs.length > this.maxLogs) {
      const logsToRemove = this.logs.length - this.maxLogs;
      this.logs.splice(0, logsToRemove);
      this.debug(`Cleared ${logsToRemove} old log entries`);
    }
  }

  /**
   * Store log entry and manage memory
   */
  private storeLogEntry(logEntry: LogEntry): void {
    this.logs.push(logEntry);
    this.clearOldLogs();
  }

  /**
   * Extract metadata from context
   */
  private extractMetadata(context: LogContext): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Extract common metadata fields
    if (context.userId) metadata.userId = context.userId;
    if (context.requestId) metadata.requestId = context.requestId;
    if (context.operation) metadata.operation = context.operation;
    if (context.resource) metadata.resource = context.resource;
    if (context.duration) metadata.duration = context.duration;

    return metadata;
  }

  /**
   * Format log message with context
   */
  private formatLogMessage(logEntry: LogEntry): string {
    const { message, context, metadata } = logEntry;
    
    let formattedMessage = message;
    
    // Add context information
    if (Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .filter(([key]) => !['userId', 'requestId', 'operation', 'resource', 'duration'].includes(key))
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      
      if (contextStr) {
        formattedMessage += ` [${contextStr}]`;
      }
    }

    // Add metadata
    if (metadata && Object.keys(metadata).length > 0) {
      const metadataStr = Object.entries(metadata)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      
      formattedMessage += ` | ${metadataStr}`;
    }

    return formattedMessage;
  }
}

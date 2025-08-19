import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

interface LogContext {
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
  userId?: string;
  userRole?: string;
  startTime: number;
  requestId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    // Create logging context with request details
    const logContext: LogContext = {
      method: request.method,
      url: request.url,
      userAgent: request.get('User-Agent'),
      ip: this.getClientIp(request),
      userId: (request as any).user?.id,
      userRole: (request as any).user?.role,
      startTime: Date.now(),
      requestId: this.generateRequestId(),
    };

    // Log incoming request with context
    this.logIncomingRequest(logContext, request);

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logSuccessfulResponse(logContext, response, data);
        },
        error: (error) => {
          this.logErrorResponse(logContext, response, error);
        },
      }),
      catchError((error) => {
        this.logErrorResponse(logContext, response, error);
        throw error;
      }),
    );
  }

  private logIncomingRequest(context: LogContext, request: Request): void {
    const logData = {
      type: 'REQUEST',
      method: context.method,
      url: context.url,
      ip: context.ip,
      userAgent: context.userAgent,
      userId: context.userId,
      userRole: context.userRole,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      headers: this.sanitizeHeaders(request.headers),
      body: this.sanitizeBody(request.body),
    };

    // Log incoming requests - useful for debugging and monitoring
    this.logger.log(`📥 ${context.method} ${context.url}`, logData);
  }

  private logSuccessfulResponse(context: LogContext, response: Response, data: any): void {
    const duration = Date.now() - context.startTime;
    const statusCode = response.statusCode;

    const logData = {
      type: 'RESPONSE',
      method: context.method,
      url: context.url,
      statusCode,
      duration: `${duration}ms`,
      userId: context.userId,
      userRole: context.userRole,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      responseSize: this.getResponseSize(data),
    };

    // Use different log levels based on status code
    if (statusCode >= 400) {
      this.logger.warn(`⚠️  ${context.method} ${context.url} (${statusCode})`, logData);
    } else {
      this.logger.log(`✅ ${context.method} ${context.url} (${statusCode})`, logData);
    }
  }

  private logErrorResponse(context: LogContext, response: Response, error: any): void {
    const duration = Date.now() - context.startTime;
    const statusCode = response.statusCode || 500;

    const logData = {
      type: 'ERROR',
      method: context.method,
      url: context.url,
      statusCode,
      duration: `${duration}ms`,
      userId: context.userId,
      userRole: context.userRole,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      },
    };

    this.logger.error(`💥 Error in ${context.method} ${context.url}`, logData);
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip = request.ip ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ||
      'unknown';
    
    return String(ip);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    Object.keys(headers).forEach((key) => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        const value = headers[key];
        sanitized[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    });

    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    const sanitized = { ...body };

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private getResponseSize(data: any): string {
    if (!data) return '0 bytes';
    
    try {
      const size = JSON.stringify(data).length;
      if (size < 1024) return `${size} bytes`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    } catch {
      return 'unknown';
    }
  }
}

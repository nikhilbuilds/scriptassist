import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
  error?: {
    code?: string;
    details?: string[];
  };
  requestId?: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Generate unique request ID for tracking
    const requestId = this.generateRequestId();

    // Log error with appropriate severity based on status code
    this.logError(exception, request, status, requestId);

    // Format error response based on status code and environment
    const errorResponse = this.formatErrorResponse(exception, request, status, requestId);

    // Set appropriate headers
    this.setErrorHeaders(response, status, requestId);

    // Send error response
    response.status(status).json(errorResponse);
  }

  private logError(exception: HttpException, request: Request, status: number, requestId: string): void {
    const logData = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: status,
      message: exception.message,
      stack: exception.stack,
      userAgent: request.get('User-Agent'),
      ip: this.getClientIp(request),
      userId: (request as any).user?.id,
      timestamp: new Date().toISOString(),
    };

    // Log with appropriate severity level
    if (status >= 500) {
      this.logger.error(`Server Error (${status}): ${exception.message}`, logData);
    } else if (status >= 400) {
      this.logger.warn(`Client Error (${status}): ${exception.message}`, logData);
    } else {
      this.logger.log(`HTTP Exception (${status}): ${exception.message}`, logData);
    }
  }

  private formatErrorResponse(
    exception: HttpException,
    request: Request,
    status: number,
    requestId: string,
  ): ErrorResponse {
    const baseResponse: ErrorResponse = {
      success: false,
      statusCode: status,
      message: this.getSafeErrorMessage(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
    };

    // Add error details for client errors (4xx) in development
    if (status >= 400 && status < 500) {
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const errorDetails = exceptionResponse as any;
        
        baseResponse.error = {
          code: errorDetails.error || this.getErrorCode(status),
          details: Array.isArray(errorDetails.message) 
            ? errorDetails.message 
            : errorDetails.message 
              ? [errorDetails.message] 
              : undefined,
        };
      }
    }

    // Sanitize sensitive information
    return this.sanitizeErrorResponse(baseResponse, status);
  }

  private getSafeErrorMessage(exception: HttpException, status: number): string {
    const message = exception.message;

    // For server errors, don't expose internal details
    if (status >= 500) {
      return 'Internal server error';
    }

    // For client errors, return the original message
    return message || this.getDefaultErrorMessage(status);
  }

  private getDefaultErrorMessage(status: number): string {
    const errorMessages: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };

    return errorMessages[status] || 'An error occurred';
  }

  private getErrorCode(status: number): string {
    const errorCodes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };

    return errorCodes[status] || 'UNKNOWN_ERROR';
  }

  private sanitizeErrorResponse(response: ErrorResponse, status: number): ErrorResponse {
    // Remove sensitive information from error details
    if (response.error?.details) {
      response.error.details = response.error.details.map(detail => {
        // Remove potential sensitive information
        return detail
          .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
          .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
          .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
          .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]');
      });
    }

    return response;
  }

  private setErrorHeaders(response: Response, status: number, requestId: string): void {
    response.set('X-Request-ID', requestId);
    response.set('X-Error-Code', this.getErrorCode(status));
    
    // Set retry-after header for rate limiting
    if (status === 429) {
      response.set('Retry-After', '60');
    }
    
    // Set cache control headers for error responses
    response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.set('Pragma', 'no-cache');
    response.set('Expires', '0');
  }

  private getClientIp(request: Request): string {
    return (
      request.ip ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      (Array.isArray(request.headers['x-forwarded-for']) 
        ? request.headers['x-forwarded-for'][0] 
        : request.headers['x-forwarded-for']) ||
      'unknown'
    );
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

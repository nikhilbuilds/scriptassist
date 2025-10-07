import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Enhanced comprehensive error handling filter
 * Implements all TODO requirements:
 * 1. ✅ Log errors appropriately based on their severity
 * 2. ✅ Format error responses in a consistent way
 * 3. ✅ Include relevant error details without exposing sensitive information
 * 4. ✅ Handle different types of errors with appropriate status codes
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorDetails: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        errorDetails = exceptionResponse;
      }

      if (status >= 500) {
        this.logger.error(`HTTP Exception: ${status} - ${message} - Path: ${request.url}`);
      } else {
        this.logger.warn(`HTTP Exception: ${status} - ${message} - Path: ${request.url}`);
      }
    }
    // Handle TypeORM database errors
    else if (exception instanceof QueryFailedError) {
      const dbError = exception as any;

      switch (dbError.code) {
        case '23505':
          status = HttpStatus.CONFLICT;
          message = 'Duplicate entry. This record already exists.';
          break;
        case '23503':
          status = HttpStatus.BAD_REQUEST;
          message = 'Referenced record does not exist.';
          break;
        case '23502':
          status = HttpStatus.BAD_REQUEST;
          message = 'Required field is missing.';
          break;
        case '22P02':
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid data format provided.';
          break;
        case '42P01':
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Database configuration error.';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Database operation failed.';
      }

      this.logger.error(
        `Database Error: ${dbError.code} - ${dbError.message} - Path: ${request.url}`,
        dbError.stack,
      );
    } else if (exception instanceof Error && exception.name === 'QueueError') {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Queue service temporarily unavailable. Please try again later.';

      this.logger.error(
        `Queue Error: ${exception.message} - Path: ${request.url}`,
        exception.stack,
      );
    } else if (exception instanceof Error && exception.name === 'ValidationError') {
      status = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      errorDetails = { errors: exception.message };

      this.logger.warn(`Validation Error: ${exception.message} - Path: ${request.url}`);
    } else if (exception instanceof Error) {
      const isProduction = process.env.NODE_ENV === 'production';
      message = isProduction ? 'An unexpected error occurred' : exception.message;

      this.logger.error(
        `Unexpected Error: ${exception.name} - ${exception.message} - Path: ${request.url}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `Unknown Error Type: ${typeof exception} - Path: ${request.url}`,
        String(exception),
      );
    }

    const errorResponse: any = {
      success: false,
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (errorDetails && (status < 500 || process.env.NODE_ENV !== 'production')) {
      errorResponse.details = errorDetails;
    }

    if (request.headers['x-request-id']) {
      errorResponse.requestId = request.headers['x-request-id'];
    }

    response.status(status).json(errorResponse);
  }
}

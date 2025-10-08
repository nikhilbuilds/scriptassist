import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from './error-codes';
import { ERROR_MESSAGES, getErrorMessage } from './error-messages';

/**
 * Error response structure with code and message
 */
export interface ErrorResponse {
  code: ErrorCode;
  message: string;
}

/**
 * Helper function to throw ForbiddenException with error code
 */
export function forbid(code: ErrorCode, params?: Record<string, any>): never {
  const message = params ? getErrorMessage(code, params) : ERROR_MESSAGES[code];
  throw new ForbiddenException({
    code,
    message,
  });
}

/**
 * Helper function to throw NotFoundException with error code
 */
export function notFound(code: ErrorCode, params?: Record<string, any>): never {
  const message = params ? getErrorMessage(code, params) : ERROR_MESSAGES[code];
  throw new NotFoundException({
    code,
    message,
  });
}

/**
 * Helper function to throw UnauthorizedException with error code
 */
export function unauthorized(code: ErrorCode, params?: Record<string, any>): never {
  const message = params ? getErrorMessage(code, params) : ERROR_MESSAGES[code];
  throw new UnauthorizedException({
    code,
    message,
  });
}

/**
 * Helper function to throw ConflictException with error code
 */
export function conflict(code: ErrorCode, params?: Record<string, any>): never {
  const message = params ? getErrorMessage(code, params) : ERROR_MESSAGES[code];
  throw new ConflictException({
    code,
    message,
  });
}

/**
 * Helper function to throw BadRequestException with error code
 */
export function badRequest(code: ErrorCode, params?: Record<string, any>): never {
  const message = params ? getErrorMessage(code, params) : ERROR_MESSAGES[code];
  throw new BadRequestException({
    code,
    message,
  });
}

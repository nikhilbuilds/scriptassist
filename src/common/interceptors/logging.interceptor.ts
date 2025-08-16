import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const { method, originalUrl, body, headers } = req;
    const now = Date.now();

    const userAgent = headers['user-agent'] || 'N/A';
    const ip = req.ip || 'N/A';

    const sanitizedBody = this.sanitizeSensitiveData(body);

    this.logger.log(
      `Incoming Request ➡️ [${method}] ${originalUrl} from ${ip} - User-Agent: "${userAgent}"`,
    );
    this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);

    return next.handle().pipe(
      tap({
        next: responseBody => {
          const responseTime = Date.now() - now;
          this.logger.log(
            `Response ⬅️ [${method}] ${originalUrl} - Status: ${res.statusCode} - ${responseTime}ms, Response Body Size: ${this.sizeOf(responseBody)}`,
          );
        },
        error: error => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `Error 🚨 [${method}] ${originalUrl} - Status: ${res.statusCode} - ${responseTime}ms - Message: ${error.message}`,
          );
          this.logger.debug(error.stack);
        },
      }),
    );
  }

  private sanitizeSensitiveData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitizedData = { ...data };
    const sensitiveKeys = ['password', 'confirmPassword', 'creditCardNumber', 'ssn'];

    for (const key of sensitiveKeys) {
      if (sanitizedData.hasOwnProperty(key)) {
        sanitizedData[key] = '***SENSITIVE DATA***';
      }
    }

    return sanitizedData;
  }

  private sizeOf(data: any): number {
    const typeSizes: Record<
      'string' | 'number' | 'bigint' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function',
      (item: any) => number
    > = {
      undefined: () => 0,
      boolean: () => 4,
      number: () => 8,
      string: (item: string | any[]) => 2 * item.length,
      object: (item: { [x: string]: any }) =>
        !item
          ? 0
          : Object.keys(item).reduce(
              (total, key) => this.sizeOf(key) + this.sizeOf(item[key]) + total,
              0,
            ),
      bigint: () => 16,
      symbol: () => 0,
      function: () => 0,
    };

    return Math.round(typeSizes[typeof data](data) / 1000);
  }
}

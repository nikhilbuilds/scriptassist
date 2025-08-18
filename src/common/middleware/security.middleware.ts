import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Content Security Policy
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);

    // HSTS (HTTP Strict Transport Security)
    if (this.configService.get('NODE_ENV') === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Request size limit check
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    if (contentLength > maxSize) {
      return res.status(413).json({
        message: 'Request entity too large',
        error: 'Payload Too Large',
        statusCode: 413,
      });
    }

    // Basic request validation
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const contentType = req.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        return res.status(400).json({
          message: 'Content-Type must be application/json',
          error: 'Bad Request',
          statusCode: 400,
        });
      }
    }

    // Log security events
    this.logSecurityEvent(req);

    next();
  }

  private logSecurityEvent(req: Request) {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /union\s+select/i,
      /drop\s+table/i,
      /exec\s*\(/i,
    ];

    const url = req.url;
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip;

    // Check for suspicious patterns
    const isSuspicious = suspiciousPatterns.some(
      pattern => pattern.test(url) || pattern.test(userAgent),
    );

    if (isSuspicious) {
      console.warn(`Security Alert - Suspicious request detected:`, {
        ip,
        url,
        userAgent: userAgent.substring(0, 100),
        timestamp: new Date().toISOString(),
      });
    }
  }
}

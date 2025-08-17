import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import DOMPurify from 'isomorphic-dompurify';
// @ts-ignore
import { escape } from 'html-escaper';

@Injectable()
export class SecureValidationPipe implements PipeTransform<any> {
  private readonly options = {
    whitelist: true, // Remove properties not in DTO
    forbidNonWhitelisted: true, // Throw error if non-whitelisted properties exist
    forbidUnknownValues: true, // Throw error if unknown values are passed
    transform: true, // Transform payload to DTO instance
    transformOptions: {
      enableImplicitConversion: true, // Enable implicit conversion
    },
  };

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Step 1: Sanitize input data
    const sanitizedValue = this.sanitizeInput(value);

    // Step 2: Transform to DTO class
    const object = plainToClass(metatype, sanitizedValue, this.options.transformOptions);

    // Step 3: Validate the object
    const errors = await validate(object, this.options);
    
    if (errors.length > 0) {
      const validationErrors = this.formatValidationErrors(errors);
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    // Step 4: Additional security checks
    this.performSecurityChecks(object);

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private sanitizeInput(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeInput(item));
    }
    
    if (value && typeof value === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        // Sanitize key names to prevent prototype pollution
        const sanitizedKey = this.sanitizeKey(key);
        sanitized[sanitizedKey] = this.sanitizeInput(val);
      }
      return sanitized;
    }
    
    return value;
  }

  private sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return str;
    }

    // Remove null bytes and control characters
    let sanitized = str.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Normalize unicode characters
    sanitized = sanitized.normalize('NFC');
    
    // Remove potential XSS vectors
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [], // No attributes allowed
    });
    
    // Escape HTML entities
    sanitized = escape(sanitized);
    
    // Remove SQL injection patterns (basic)
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script)\b)/gi,
      /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script)\b.*\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script)\b)/gi,
    ];
    
    sqlPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    // Remove NoSQL injection patterns
    const nosqlPatterns = [
      /\$where/gi,
      /\$ne/gi,
      /\$gt/gi,
      /\$lt/gi,
      /\$regex/gi,
    ];
    
    nosqlPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    // Remove command injection patterns
    const commandPatterns = [
      /[;&|`$(){}[\]]/g,
      /\b(cat|ls|pwd|whoami|id|uname|ps|netstat|ifconfig|ipconfig)\b/gi,
    ];
    
    commandPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  }

  private sanitizeKey(key: string): string {
    // Prevent prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return `sanitized_${key}`;
    }
    
    // Remove dangerous characters from keys
    return key.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private formatValidationErrors(errors: any[]): any[] {
    return errors.map(error => ({
      field: error.property,
      value: error.value,
      constraints: error.constraints,
      children: error.children ? this.formatValidationErrors(error.children) : [],
    }));
  }

  private performSecurityChecks(object: any): void {
    // Check for potential security issues
    this.checkForSuspiciousPatterns(object);
    this.checkForLargePayloads(object);
    this.checkForNestedObjects(object);
  }

  private checkForSuspiciousPatterns(object: any): void {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /data:application\/javascript/i,
    ];

    const checkValue = (value: any): boolean => {
      if (typeof value === 'string') {
        return suspiciousPatterns.some(pattern => pattern.test(value));
      }
      
      if (Array.isArray(value)) {
        return value.some(checkValue);
      }
      
      if (value && typeof value === 'object') {
        return Object.values(value).some(checkValue);
      }
      
      return false;
    };

    if (checkValue(object)) {
      throw new BadRequestException('Suspicious content detected');
    }
  }

  private checkForLargePayloads(object: any): void {
    const maxSize = 1024 * 1024; // 1MB
    const payloadSize = JSON.stringify(object).length;
    
    if (payloadSize > maxSize) {
      throw new BadRequestException('Payload too large');
    }
  }

  private checkForNestedObjects(object: any, depth = 0): void {
    const maxDepth = 10;
    
    if (depth > maxDepth) {
      throw new BadRequestException('Object nesting too deep');
    }
    
    if (object && typeof object === 'object' && !Array.isArray(object)) {
      for (const value of Object.values(object)) {
        if (value && typeof value === 'object') {
          this.checkForNestedObjects(value, depth + 1);
        }
      }
    }
  }
}

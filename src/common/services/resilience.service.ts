import { Injectable, Logger } from '@nestjs/common';

export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  recoveryTimeout: number; // Time to wait before trying to close circuit (ms)
  expectedResponseTime: number; // Expected response time threshold (ms)
}

export interface RetryOptions {
  maxAttempts: number;
  backoffDelay: number; // Base delay for exponential backoff (ms)
  maxDelay: number; // Maximum delay between retries (ms)
}

export interface TimeoutOptions {
  timeout: number; // Timeout in milliseconds
  fallback?: () => any; // Fallback function if timeout occurs
}

export interface ResilienceOptions {
  circuitBreaker?: CircuitBreakerOptions;
  retry?: RetryOptions;
  timeout?: TimeoutOptions;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',      // Normal operation
  OPEN = 'OPEN',          // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is recovered
}

@Injectable()
export class ResilienceService {
  private readonly logger = new Logger(ResilienceService.name);
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly defaultCircuitBreakerOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    expectedResponseTime: 1000, // 1 second
  };
  private readonly defaultRetryOptions: RetryOptions = {
    maxAttempts: 3,
    backoffDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
  };

  /**
   * Execute an operation with resilience patterns
   */
  async executeWithResilience<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: ResilienceOptions = {}
  ): Promise<T> {
    const circuitBreaker = this.getOrCreateCircuitBreaker(operationName, options.circuitBreaker);
    const retryOptions = { ...this.defaultRetryOptions, ...options.retry };
    const timeoutOptions = options.timeout;

    try {
      // Check circuit breaker state
      if (!circuitBreaker.canExecute()) {
        throw new Error(`Circuit breaker is ${circuitBreaker.getState()} for operation: ${operationName}`);
      }

      // Execute with timeout if specified
      let result: T;
      if (timeoutOptions) {
        result = await this.executeWithTimeout(operation, timeoutOptions);
      } else {
        result = await operation();
      }

      // Record success
      circuitBreaker.recordSuccess();
      return result;

    } catch (error) {
      // Record failure
      circuitBreaker.recordFailure();
      
      // Attempt retry if configured
      if (retryOptions.maxAttempts > 1) {
        return this.executeWithRetry(operationName, operation, retryOptions, circuitBreaker);
      }
      
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    options: TimeoutOptions
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${options.timeout}ms`));
      }, options.timeout);
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      if (options.fallback) {
        this.logger.warn(`Operation timed out, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return options.fallback();
      }
      throw error;
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: RetryOptions,
    circuitBreaker: CircuitBreaker
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        if (!circuitBreaker.canExecute()) {
          throw new Error(`Circuit breaker is ${circuitBreaker.getState()} for operation: ${operationName}`);
        }

        const result = await operation();
        circuitBreaker.recordSuccess();
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === options.maxAttempts) {
          this.logger.error(`Operation ${operationName} failed after ${options.maxAttempts} attempts: ${lastError.message}`);
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          options.backoffDelay * Math.pow(2, attempt - 1),
          options.maxDelay
        );

        this.logger.warn(`Operation ${operationName} failed (attempt ${attempt}/${options.maxAttempts}), retrying in ${delay}ms: ${lastError.message}`);
        
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Get or create a circuit breaker for an operation
   */
  private getOrCreateCircuitBreaker(
    operationName: string,
    options?: Partial<CircuitBreakerOptions>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(operationName)) {
      const circuitBreakerOptions = { ...this.defaultCircuitBreakerOptions, ...options };
      this.circuitBreakers.set(operationName, new CircuitBreaker(operationName, circuitBreakerOptions, this.logger));
    }
    
    return this.circuitBreakers.get(operationName)!;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      status[name] = {
        state: circuitBreaker.getState(),
        failureCount: circuitBreaker.getFailureCount(),
        successCount: circuitBreaker.getSuccessCount(),
        lastFailureTime: circuitBreaker.getLastFailureTime(),
        nextAttemptTime: circuitBreaker.getNextAttemptTime(),
      };
    }
    
    return status;
  }

  /**
   * Reset all circuit breakers (useful for testing)
   */
  resetAllCircuitBreakers(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
    this.logger.log('All circuit breakers have been reset');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions,
    private readonly logger: Logger
  ) {}

  canExecute(): boolean {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;
      
      case CircuitBreakerState.OPEN:
        if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime.getTime()) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.logger.log(`Circuit breaker for ${this.name} moved to HALF_OPEN state`);
          return true;
        }
        return false;
      
      case CircuitBreakerState.HALF_OPEN:
        return true;
      
      default:
        return false;
    }
  }

  recordSuccess(): void {
    this.successCount++;
    this.failureCount = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      this.logger.log(`Circuit breaker for ${this.name} moved to CLOSED state`);
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.state === CircuitBreakerState.CLOSED && this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.options.recoveryTimeout);
      this.logger.warn(`Circuit breaker for ${this.name} opened due to ${this.failureCount} failures`);
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.options.recoveryTimeout);
      this.logger.warn(`Circuit breaker for ${this.name} reopened due to failure in HALF_OPEN state`);
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getSuccessCount(): number {
    return this.successCount;
  }

  getLastFailureTime(): Date | undefined {
    return this.lastFailureTime;
  }

  getNextAttemptTime(): Date | undefined {
    return this.nextAttemptTime;
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
  }
}

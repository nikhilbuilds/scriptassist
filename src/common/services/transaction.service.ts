import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';

export interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  timeout?: number;
  maxRetries?: number;
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  retryCount: number;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private dataSource: DataSource) {}

  /**
   * Execute a function within a database transaction
   */
  async executeInTransaction<T>(
    operation: (entityManager: EntityManager) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const {
      isolationLevel = 'READ COMMITTED',
      timeout = 30000,
      maxRetries = 3
    } = options;

    let lastError: Error;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      const queryRunner = this.dataSource.createQueryRunner();
      
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction(isolationLevel as any);

        // Set transaction timeout
        if (timeout) {
          await queryRunner.query(`SET LOCAL statement_timeout = ${timeout}`);
        }

        const result = await operation(queryRunner.manager);
        
        await queryRunner.commitTransaction();
        await queryRunner.release();

        this.logger.debug(`Transaction completed successfully (attempt ${retryCount + 1})`);
        return result;

      } catch (error) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();

        lastError = error as Error;
        retryCount++;

        // Check if error is retryable
        if (this.isRetryableError(error) && retryCount <= maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          this.logger.warn(`Transaction failed, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
          await this.sleep(delay);
          continue;
        }

        this.logger.error(`Transaction failed after ${retryCount} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async executeBatchInTransaction<T>(
    operations: Array<(entityManager: EntityManager) => Promise<T>>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    return this.executeInTransaction(async (entityManager) => {
      const results: T[] = [];
      
      for (const operation of operations) {
        const result = await operation(entityManager);
        results.push(result);
      }
      
      return results;
    }, options);
  }

  /**
   * Execute operations with saga pattern for distributed transactions
   */
  async executeSaga<T>(
    operations: Array<{
      execute: (entityManager: EntityManager) => Promise<T>;
      compensate: (entityManager: EntityManager, data: T) => Promise<void>;
    }>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    const results: T[] = [];
    const compensations: Array<() => Promise<void>> = [];

    try {
      for (const operation of operations) {
        const result = await this.executeInTransaction(async (entityManager) => {
          const data = await operation.execute(entityManager);
          
          // Store compensation function
          compensations.push(async () => {
            await this.executeInTransaction(async (compensationManager) => {
              await operation.compensate(compensationManager, data);
            });
          });
          
          return data;
        }, options);

        results.push(result);
      }

      return results;
    } catch (error) {
      // Execute compensations in reverse order
      this.logger.error(`Saga failed, executing compensations: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      for (let i = compensations.length - 1; i >= 0; i--) {
        try {
          await compensations[i]();
        } catch (compensationError) {
                      this.logger.error(`Compensation failed: ${compensationError instanceof Error ? compensationError.message : 'Unknown error'}`);
        }
      }

      throw error;
    }
  }

  /**
   * Execute read-only operations with proper isolation
   */
  async executeReadOnly<T>(
    operation: (entityManager: EntityManager) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    return this.executeInTransaction(operation, {
      ...options,
      isolationLevel: 'READ COMMITTED'
    });
  }

  /**
   * Execute write operations with serializable isolation
   */
  async executeWrite<T>(
    operation: (entityManager: EntityManager) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    return this.executeInTransaction(operation, {
      ...options,
      isolationLevel: 'SERIALIZABLE'
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // PostgreSQL deadlock and serialization errors
    const retryableCodes = [
      '40P01', // deadlock_detected
      '40001', // serialization_failure
      '25P03', // idle_in_transaction_session_timeout
      '57014', // query_canceled
    ];

    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    // Network-related errors
    if (error.message && (
      error.message.includes('connection') ||
      error.message.includes('timeout') ||
      error.message.includes('network')
    )) {
      return true;
    }

    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(): Promise<{
    activeConnections: number;
    maxConnections: number;
    idleConnections: number;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    
    try {
      const stats = await queryRunner.query(`
        SELECT 
          count(*) as active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);

      return {
        activeConnections: parseInt(stats[0].active_connections),
        maxConnections: parseInt(stats[0].max_connections),
        idleConnections: parseInt(stats[0].idle_connections),
      };
    } finally {
      await queryRunner.release();
    }
  }
}

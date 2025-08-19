import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  private readonly client: Redis;
  private readonly keyPrefix = 'script-assist-cache:';
  private readonly logger = new Logger(CacheService.name);

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
    });
  }

  /**
   * @param key The key to store the value under.
   * @param value The value to be cached.
   * @param ttlSeconds The time-to-live in seconds. Defaults to 300.
   */
  async set(key: string, value: string | Buffer | number, ttlSeconds = 300): Promise<void> {
    const prefixedKey = this.keyPrefix + key;
    await this.client.set(prefixedKey, value, 'EX', ttlSeconds);
  }

  /**
   * Sets a complex object in the Redis cache.
   * It handles the serialization of the object to a JSON string.
   * @param key The key to store the object under.
   * @param value The object to be cached.
   * @param ttlSeconds The time-to-live in seconds. Defaults to 300.
   */
  async setObject(key: string, value: any, ttlSeconds = 300): Promise<void> {
    const prefixedKey = this.keyPrefix + key;
    const serializedValue = JSON.stringify(value);
    await this.client.set(prefixedKey, serializedValue, 'EX', ttlSeconds);
  }

  /**
   * @param key The key to increment.
   * @returns The new value after incrementing.
   */
  async increment(key: string): Promise<number> {
    const prefixedKey = this.keyPrefix + key;
    const newValue = await this.client.incr(prefixedKey);
    return newValue;
  }

  /**
   * Retrieves a raw string value from the Redis cache.
   * @param key The key to retrieve.
   * @returns The raw string value or null if not found.+
   */
  async get(key: string): Promise<string | Buffer | number | null> {
    const prefixedKey = this.keyPrefix + key;
    return await this.client.get(prefixedKey);
  }

  /**
   * Retrieves a value from the Redis cache and deserializes it from a JSON string.
   * @param key The key to retrieve.
   * @returns The deserialized value or null if not found.
   */
  async getObject<T>(key: string): Promise<T | null> {
    const prefixedKey = this.keyPrefix + key;
    const serializedValue = await this.client.get(prefixedKey);

    if (!serializedValue) {
      return null;
    }

    return JSON.parse(serializedValue) as T;
  }

  /**
   * Deletes a key from the Redis cache.
   * @param key The key to delete.
   * @returns A boolean indicating if the key was deleted.
   */
  async delete(key: string): Promise<boolean> {
    const prefixedKey = this.keyPrefix + key;
    const deletedCount = await this.client.del(prefixedKey);
    return deletedCount > 0;
  }

  /**
   * Clears all keys in the cache by flushing the Redis database.
   */
  async clear(): Promise<void> {
    await this.client.flushall();
  }

  /**
   * Checks if a key exists in the Redis cache.
   * @param key The key to check.
   * @returns A boolean indicating if the key exists.
   */
  async has(key: string): Promise<boolean> {
    const prefixedKey = this.keyPrefix + key;
    const exists = await this.client.exists(prefixedKey);
    return exists > 0;
  }

  async pingCheck(): Promise<HealthIndicatorResult<'cache'>> {
    try {
      await this.client.ping();
      return { cache: { status: 'up' } };
    } catch (error) {
      this.logger.error('Cache ping failed', error);
      return { cache: { status: 'down' } };
    }
  }
}

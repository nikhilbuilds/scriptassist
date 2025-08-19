import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheItem<T = unknown> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  totalItems: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  memoryUsage: number;
}

interface CacheOptions {
  ttl?: number;
  namespace?: string;
  maxSize?: number;
  maxMemoryMB?: number;
  enableLRU?: boolean;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache = new Map<string, CacheItem>();
  private readonly stats: CacheStats = {
    totalItems: 0,
    totalSize: 0,
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    memoryUsage: 0,
  };

  private readonly defaultOptions: Required<CacheOptions> = {
    ttl: 300, // 5 minutes
    namespace: 'default',
    maxSize: 1000,
    maxMemoryMB: 100,
    enableLRU: true,
  };

  private cleanupInterval: NodeJS.Timeout;
  private readonly namespacePrefix = 'cache:';

  constructor(private readonly configService: ConfigService) {
    this.initializeCache();
    this.startCleanupInterval();
  }

  /**
   * Set a value in the cache with options
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {},
  ): Promise<void> {
    try {
      const opts = { ...this.defaultOptions, ...options };
      const fullKey = this.getNamespacedKey(key, opts.namespace);

      // Validate key
      if (!this.isValidKey(fullKey)) {
        throw new Error(`Invalid cache key: ${key}`);
      }

      // Check memory limits before setting
      await this.enforceMemoryLimits(opts);

      // Serialize and store value
      const serializedValue = this.serialize(value);
      const itemSize = this.calculateItemSize(fullKey, serializedValue);

      const cacheItem: CacheItem<T> = {
        value: serializedValue as T,
        expiresAt: Date.now() + opts.ttl * 1000,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      // Remove existing item if it exists
      const existingItem = this.cache.get(fullKey);
      if (existingItem) {
        this.stats.totalSize -= this.calculateItemSize(fullKey, existingItem.value);
      }

      // Store new item
      this.cache.set(fullKey, cacheItem);
      this.stats.totalItems = this.cache.size;
      this.stats.totalSize += itemSize;

      this.logger.debug(`Cache SET: ${fullKey} (${itemSize} bytes)`);
    } catch (error) {
      this.logger.error(`Cache SET failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a value from the cache
   */
  async get<T>(key: string, namespace = 'default'): Promise<T | null> {
    try {
      const fullKey = this.getNamespacedKey(key, namespace);
      const item = this.cache.get(fullKey) as CacheItem<T> | undefined;

      if (!item) {
        this.stats.missCount++;
        this.logger.debug(`Cache MISS: ${fullKey}`);
        return null;
      }

      // Check expiration
      if (item.expiresAt < Date.now()) {
        await this.delete(key, namespace);
        this.stats.missCount++;
        this.logger.debug(`Cache EXPIRED: ${fullKey}`);
        return null;
      }

      // Update access statistics
      item.accessCount++;
      item.lastAccessed = Date.now();
      this.stats.hitCount++;

      // Deserialize and return value
      const deserializedValue = this.deserialize<T>(item.value);
      this.logger.debug(`Cache HIT: ${fullKey}`);
      return deserializedValue;
    } catch (error) {
      this.logger.error(`Cache GET failed for key ${key}:`, error);
      this.stats.missCount++;
      return null;
    }
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string, namespace = 'default'): Promise<boolean> {
    try {
      const fullKey = this.getNamespacedKey(key, namespace);
      const item = this.cache.get(fullKey);

      if (item) {
        const itemSize = this.calculateItemSize(fullKey, item.value);
        this.cache.delete(fullKey);
        this.stats.totalItems = this.cache.size;
        this.stats.totalSize -= itemSize;
        this.logger.debug(`Cache DELETE: ${fullKey}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Cache DELETE failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Clear all cache entries or entries in a specific namespace
   */
  async clear(namespace?: string): Promise<void> {
    try {
      if (namespace) {
        // Clear specific namespace
        const namespacePrefix = this.getNamespacedKey('', namespace);
        const keysToDelete: string[] = [];

        for (const key of this.cache.keys()) {
          if (key.startsWith(namespacePrefix)) {
            keysToDelete.push(key);
          }
        }

        for (const key of keysToDelete) {
          await this.delete(key.replace(namespacePrefix, ''), namespace);
        }

        this.logger.log(`Cache cleared for namespace: ${namespace}`);
      } else {
        // Clear all cache
        this.cache.clear();
        this.stats.totalItems = 0;
        this.stats.totalSize = 0;
        this.logger.log('Cache cleared completely');
      }
    } catch (error) {
      this.logger.error('Cache CLEAR failed:', error);
      throw error;
    }
  }

  /**
   * Check if a key exists in the cache
   */
  async has(key: string, namespace = 'default'): Promise<boolean> {
    try {
      const fullKey = this.getNamespacedKey(key, namespace);
      const item = this.cache.get(fullKey);

      if (!item) {
        return false;
      }

      // Check expiration
      if (item.expiresAt < Date.now()) {
        await this.delete(key, namespace);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Cache HAS check failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return {
      ...this.stats,
      memoryUsage: this.calculateMemoryUsage(),
    };
  }

  /**
   * Get all keys in a namespace
   */
  async getKeys(namespace = 'default'): Promise<string[]> {
    const namespacePrefix = this.getNamespacedKey('', namespace);
    const keys: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(namespacePrefix)) {
        keys.push(key.replace(namespacePrefix, ''));
      }
    }

    return keys;
  }

  /**
   * Bulk operations
   */
  async setMany<T>(
    items: Array<{ key: string; value: T; options?: CacheOptions }>,
  ): Promise<void> {
    const promises = items.map(({ key, value, options }) =>
      this.set(key, value, options),
    );
    await Promise.all(promises);
  }

  async getMany<T>(keys: string[], namespace = 'default'): Promise<Record<string, T | null>> {
    const promises = keys.map(async (key) => {
      const value = await this.get<T>(key, namespace);
      return { key, value };
    });

    const results = await Promise.all(promises);
    return results.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, T | null>);
  }

  async deleteMany(keys: string[], namespace = 'default'): Promise<number> {
    const promises = keys.map((key) => this.delete(key, namespace));
    const results = await Promise.all(promises);
    return results.filter(Boolean).length;
  }

  // Private helper methods

  private initializeCache(): void {
    // Load configuration from environment
    const maxSize = this.configService.get<number>('CACHE_MAX_SIZE', 1000);
    const maxMemoryMB = this.configService.get<number>('CACHE_MAX_MEMORY_MB', 100);
    const defaultTTL = this.configService.get<number>('CACHE_DEFAULT_TTL', 300);

    this.defaultOptions.maxSize = maxSize;
    this.defaultOptions.maxMemoryMB = maxMemoryMB;
    this.defaultOptions.ttl = defaultTTL;

    this.logger.log(`Cache initialized with maxSize: ${maxSize}, maxMemory: ${maxMemoryMB}MB`);
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredItems();
    }, 60000); // Run every minute
  }

  private async cleanupExpiredItems(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.stats.totalItems = this.cache.size;
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired cache items`);
    }
  }

  private async enforceMemoryLimits(options: Required<CacheOptions>): Promise<void> {
    const currentMemoryMB = this.calculateMemoryUsage() / (1024 * 1024);

    if (currentMemoryMB > options.maxMemoryMB) {
      await this.evictItems(options);
    }

    if (this.cache.size >= options.maxSize) {
      await this.evictItems(options);
    }
  }

  private async evictItems(options: Required<CacheOptions>): Promise<void> {
    if (!options.enableLRU) {
      // Simple FIFO eviction
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        await this.delete(firstKey.replace(this.namespacePrefix, ''));
      }
      return;
    }

    // LRU eviction
    const items = Array.from(this.cache.entries()).map(([key, item]) => ({
      key,
      lastAccessed: item.lastAccessed,
      accessCount: item.accessCount,
    }));

    // Sort by last accessed time (oldest first)
    items.sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Evict oldest 10% of items
    const evictCount = Math.max(1, Math.floor(this.cache.size * 0.1));
    const keysToEvict = items.slice(0, evictCount);

    for (const { key } of keysToEvict) {
      await this.delete(key.replace(this.namespacePrefix, ''));
    }

    this.stats.evictionCount += keysToEvict.length;
    this.logger.debug(`LRU eviction: removed ${keysToEvict.length} items`);
  }

  private getNamespacedKey(key: string, namespace: string): string {
    return `${this.namespacePrefix}${namespace}:${key}`;
  }

  private isValidKey(key: string): boolean {
    return key.length > 0 && key.length <= 250 && /^[a-zA-Z0-9:_-]+$/.test(key);
  }

  private serialize<T>(value: T): unknown {
    try {
      // For complex objects, use JSON serialization
      if (typeof value === 'object' && value !== null) {
        return JSON.parse(JSON.stringify(value));
      }
      return value;
    } catch (error) {
      this.logger.warn('Serialization failed, storing as-is:', error);
      return value;
    }
  }

  private deserialize<T>(value: unknown): T {
    try {
      // If it's already the correct type, return as-is
      return value as T;
    } catch (error) {
      this.logger.warn('Deserialization failed:', error);
      return value as T;
    }
  }

  private calculateItemSize(key: string, value: unknown): number {
    try {
      const serialized = JSON.stringify({ key, value });
      return Buffer.byteLength(serialized, 'utf8');
    } catch {
      return key.length + 100; // Fallback estimation
    }
  }

  private calculateMemoryUsage(): number {
    return this.stats.totalSize;
  }

  // Cleanup on service destruction
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.logger.log('Cache service destroyed');
  }
}

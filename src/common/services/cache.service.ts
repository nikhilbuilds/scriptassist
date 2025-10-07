import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Production-grade in-memory cache with LRU eviction, TTL cleanup, cloning, and metrics.
 *
 * Features:
 * - LRU (Least Recently Used) eviction when max size is reached
 * - Automatic background TTL cleanup to prevent memory leaks
 * - Deep cloning of values to prevent unintended mutations
 * - Key namespacing and validation
 * - Comprehensive metrics and monitoring
 * - Bulk operations support
 * - Configurable limits and policies
 */

interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  size: number;
}

interface CacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  expirationCount: number;
  totalMemoryBytes: number;
  oldestEntryAge: number | null;
  hitRate: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTtlSeconds: number;
  cleanupIntervalMs: number;
  enableDeepClone: boolean;
  namespace?: string;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  // Use Map for better performance (O(1) operations)
  private cache: Map<string, CacheEntry> = new Map();

  // LRU tracking: keys in access order (most recent at the end)
  private lruQueue: string[] = [];

  // Metrics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  // Configuration
  private config: CacheConfig = {
    maxSize: 1000, // Max number of entries
    defaultTtlSeconds: 300, // 5 minutes
    cleanupIntervalMs: 60000, // 1 minute
    enableDeepClone: true,
    namespace: 'default',
  };

  private cleanupInterval: NodeJS.Timeout;
  private totalMemoryBytes = 0;

  constructor() {
    // Start background TTL cleanup
    this.startBackgroundCleanup();
    this.logger.log('Cache service initialized with LRU eviction and TTL cleanup');
  }

  /**
   * Configure cache behavior
   */
  configure(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log(`Cache configured: ${JSON.stringify(this.config)}`);
  }

  /**
   * Set a value in the cache with optional TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      // Validate key
      const validatedKey = this.validateAndNamespaceKey(key);

      // Use configured default if TTL not provided
      const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;

      // Clone value to prevent external mutations
      const clonedValue = this.config.enableDeepClone ? this.deepClone(value) : value;

      // Calculate approximate size
      const size = this.calculateSize(clonedValue);

      // Check if key exists (for updates)
      const existingEntry = this.cache.get(validatedKey);
      if (existingEntry) {
        this.totalMemoryBytes -= existingEntry.size;
        this.removeLruEntry(validatedKey);
      }

      // Enforce max size with LRU eviction
      this.evictIfNeeded();

      // Create entry
      const entry: CacheEntry = {
        value: clonedValue,
        expiresAt: Date.now() + ttl * 1000,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        size,
      };

      this.cache.set(validatedKey, entry);
      this.lruQueue.push(validatedKey);
      this.totalMemoryBytes += size;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error setting cache key "${key}": ${message}`);
      throw error;
    }
  }

  /**
   * Get a value from the cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const validatedKey = this.validateAndNamespaceKey(key);
      const entry = this.cache.get(validatedKey);

      if (!entry) {
        this.stats.misses++;
        return null;
      }

      // Check expiration
      if (this.isExpired(entry)) {
        this.deleteInternal(validatedKey, true);
        this.stats.misses++;
        return null;
      }

      // Update LRU and access stats
      this.updateLru(validatedKey);
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;

      this.stats.hits++;

      // Clone on return to prevent external mutations
      return this.config.enableDeepClone ? this.deepClone(entry.value) : entry.value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error getting cache key "${key}": ${message}`);
      return null;
    }
  }

  /**
   * Delete a key from the cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const validatedKey = this.validateAndNamespaceKey(key);
      return this.deleteInternal(validatedKey, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error deleting cache key "${key}": ${message}`);
      return false;
    }
  }

  /**
   * Clear all entries from the cache
   */
  async clear(): Promise<void> {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.lruQueue = [];
      this.totalMemoryBytes = 0;
      this.logger.log(`Cache cleared: ${size} entries removed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error clearing cache: ${message}`);
      throw error;
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  async has(key: string): Promise<boolean> {
    try {
      const validatedKey = this.validateAndNamespaceKey(key);
      const entry = this.cache.get(validatedKey);

      if (!entry) {
        return false;
      }

      if (this.isExpired(entry)) {
        this.deleteInternal(validatedKey, true);
        return false;
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error checking cache key "${key}": ${message}`);
      return false;
    }
  }

  /**
   * Set multiple key-value pairs at once
   */
  async setMany(entries: Array<{ key: string; value: any; ttlSeconds?: number }>): Promise<void> {
    const promises = entries.map(({ key, value, ttlSeconds }) => this.set(key, value, ttlSeconds));
    await Promise.all(promises);
  }

  /**
   * Get multiple keys at once
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) {
        result.set(key, value);
      }
    }

    return result;
  }

  /**
   * Delete multiple keys at once
   */
  async deleteMany(keys: string[]): Promise<number> {
    let deletedCount = 0;

    for (const key of keys) {
      const deleted = await this.delete(key);
      if (deleted) deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());

    if (!pattern) {
      return allKeys.map(k => this.removeNamespace(k));
    }

    // Simple pattern matching (supports * wildcard)
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allKeys
      .filter(k => regex.test(this.removeNamespace(k)))
      .map(k => this.removeNamespace(k));
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    let oldestEntryAge: number | null = null;
    if (this.cache.size > 0) {
      const oldestEntry = Array.from(this.cache.values()).reduce((oldest, entry) =>
        entry.createdAt < oldest.createdAt ? entry : oldest,
      );
      oldestEntryAge = Date.now() - oldestEntry.createdAt;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitCount: this.stats.hits,
      missCount: this.stats.misses,
      evictionCount: this.stats.evictions,
      expirationCount: this.stats.expirations,
      totalMemoryBytes: this.totalMemoryBytes,
      oldestEntryAge,
      hitRate: parseFloat((hitRate * 100).toFixed(2)),
    };
  }

  /**
   * Reset statistics
   */
  async resetStats(): Promise<void> {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
    };
    this.logger.log('Cache statistics reset');
  }

  /**
   * Get TTL (time to live) for a key in seconds
   */
  async getTtl(key: string): Promise<number | null> {
    const validatedKey = this.validateAndNamespaceKey(key);
    const entry = this.cache.get(validatedKey);

    if (!entry || this.isExpired(entry)) {
      return null;
    }

    return Math.floor((entry.expiresAt - Date.now()) / 1000);
  }

  /**
   * Update TTL for an existing key
   */
  async updateTtl(key: string, ttlSeconds: number): Promise<boolean> {
    const validatedKey = this.validateAndNamespaceKey(key);
    const entry = this.cache.get(validatedKey);

    if (!entry || this.isExpired(entry)) {
      return false;
    }

    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }

  // ========== Private Helper Methods ==========

  private validateAndNamespaceKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Cache key must be a non-empty string');
    }

    if (key.length > 250) {
      throw new Error('Cache key exceeds maximum length of 250 characters');
    }

    // Add namespace prefix
    return `${this.config.namespace}:${key}`;
  }

  private removeNamespace(namespacedKey: string): string {
    const prefix = `${this.config.namespace}:`;
    return namespacedKey.startsWith(prefix) ? namespacedKey.slice(prefix.length) : namespacedKey;
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt < Date.now();
  }

  private deleteInternal(validatedKey: string, isExpiration: boolean): boolean {
    const entry = this.cache.get(validatedKey);

    if (!entry) {
      return false;
    }

    this.cache.delete(validatedKey);
    this.removeLruEntry(validatedKey);
    this.totalMemoryBytes -= entry.size;

    if (isExpiration) {
      this.stats.expirations++;
    }

    return true;
  }

  private evictIfNeeded(): void {
    while (this.cache.size >= this.config.maxSize && this.lruQueue.length > 0) {
      // Evict least recently used entry
      const lruKey = this.lruQueue.shift();
      if (lruKey) {
        this.deleteInternal(lruKey, false);
        this.stats.evictions++;
      }
    }
  }

  private updateLru(key: string): void {
    this.removeLruEntry(key);
    this.lruQueue.push(key);
  }

  private removeLruEntry(key: string): void {
    const index = this.lruQueue.indexOf(key);
    if (index > -1) {
      this.lruQueue.splice(index, 1);
    }
  }

  private deepClone<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle primitive types
    if (typeof value !== 'object') {
      return value;
    }

    try {
      // Use structured clone for deep cloning (Node 17+)
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }

      // Fallback to JSON serialization (has limitations but works for most cases)
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to clone value, storing reference: ${message}`);
      return value;
    }
  }

  private calculateSize(value: any): number {
    try {
      // Rough estimation of memory size
      const str = JSON.stringify(value);
      // Each character is roughly 2 bytes in UTF-16
      return str.length * 2;
    } catch {
      // If can't stringify, use a default size
      return 100;
    }
  }

  private startBackgroundCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.config.cleanupIntervalMs);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.deleteInternal(key, true);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.logger.debug(`Background cleanup: removed ${expiredCount} expired entries`);
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.logger.log('Cache cleanup interval stopped');
    }
  }
}

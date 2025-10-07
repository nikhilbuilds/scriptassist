import * as crypto from 'crypto';
import { CacheService } from '../services/cache.service';
import { Logger } from '@nestjs/common';

/**
 * Cache utility functions for namespace versioning and cache key generation
 * These utilities help implement efficient cache invalidation strategies
 */

const logger = new Logger('CacheUtil');

/**
 * Bump the namespace version for a given scope (e.g., user, organization)
 * This invalidates all cache keys within that namespace without explicit deletion
 *
 * @param cacheService - The cache service instance
 * @param scope - The scope identifier (e.g., 'user:123', 'org:456')
 * @param ttl - TTL for the namespace key in seconds (default: 24 hours)
 *
 * @example
 * // User created a task → invalidate their task lists
 * await bumpCacheNamespace(cacheService, `user:${userId}`);
 */
export async function bumpCacheNamespace(
  cacheService: CacheService,
  scope: string,
  ttl: number = 86400,
): Promise<void> {
  const nsKey = `ns:${scope}`;
  const currentVersion = (await cacheService.get<number>(nsKey)) || 0;
  const newVersion = currentVersion + 1;

  // Store with a long TTL (default: 24 hours) to prevent unbounded growth
  await cacheService.set(nsKey, newVersion, ttl);

  logger.debug(`Bumped cache namespace for ${scope}: v${currentVersion} → v${newVersion}`);
}

/**
 * Get the current namespace version for a given scope
 * Returns 0 if namespace doesn't exist yet
 *
 * @param cacheService - The cache service instance
 * @param scope - The scope identifier
 * @returns The current namespace version (defaults to 0)
 */
export async function getCacheNamespace(
  cacheService: CacheService,
  scope: string,
): Promise<number> {
  const nsKey = `ns:${scope}`;
  return (await cacheService.get<number>(nsKey)) || 0;
}

/**
 * Build a deterministic hash from an object (used for cache key generation)
 * Same input always produces the same hash
 *
 * @param data - The object to hash (filters, pagination, etc.)
 * @param length - The length of the hash to return (default: 12)
 * @returns A short, deterministic hash string
 *
 * @example
 * const hash = buildCacheHash({ status: 'PENDING', page: 1, limit: 10 });
 * // Returns: 'a3f4b2c1d5e6'
 */
export function buildCacheHash(data: Record<string, any>, length: number = 12): string {
  const dataString = JSON.stringify(data);
  return crypto.createHash('md5').update(dataString).digest('hex').substring(0, length);
}

/**
 * Build a cache key with namespace versioning
 * The namespace version is included in the key, so bumping the namespace
 * automatically invalidates all keys in that namespace
 *
 * @param cacheService - The cache service instance
 * @param options - Configuration for building the cache key
 * @returns A namespaced cache key
 *
 * @example
 * const cacheKey = await buildNamespacedCacheKey(cacheService, {
 *   scope: `user:${userId}`,
 *   resource: 'tasks',
 *   identifier: 'list',
 *   params: { status: 'PENDING', page: 1, limit: 10 }
 * });
 * // Returns: 'ns:v3:user:123:tasks:list:a3f4b2c1d5e6'
 */
export async function buildNamespacedCacheKey(
  cacheService: CacheService,
  options: {
    scope: string;
    resource: string;
    identifier: string;
    params?: Record<string, any>;
  },
): Promise<string> {
  const { scope, resource, identifier, params = {} } = options;

  const version = await getCacheNamespace(cacheService, scope);
  const paramsHash = Object.keys(params).length > 0 ? buildCacheHash(params) : '';

  const parts = ['ns', `v${version}`, scope, resource, identifier];
  if (paramsHash) {
    parts.push(paramsHash);
  }

  return parts.join(':');
}

/**
 * Build a simple entity cache key (without namespace versioning)
 * Used for single entity caching where invalidation is explicit (delete on update)
 *
 * @param resource - The resource type (e.g., 'user', 'task', 'organization')
 * @param id - The entity identifier
 * @returns A simple cache key
 *
 * @example
 * const cacheKey = buildEntityCacheKey('task', taskId);
 * // Returns: 'task:123e4567-e89b-12d3-a456-426614174000'
 */
export function buildEntityCacheKey(resource: string, id: string): string {
  return `${resource}:${id}`;
}

/**
 * Build a list cache key with pagination parameters
 * Useful for building consistent cache keys for paginated lists
 *
 * @param cacheService - The cache service instance
 * @param options - Configuration for the list cache key
 * @returns A cache key for a paginated list
 *
 * @example
 * const cacheKey = await buildListCacheKey(cacheService, {
 *   scope: `user:${userId}`,
 *   resource: 'tasks',
 *   filters: { status: 'PENDING', priority: 'HIGH' },
 *   pagination: { page: 1, limit: 10 }
 * });
 */
export async function buildListCacheKey(
  cacheService: CacheService,
  options: {
    scope: string;
    resource: string;
    filters?: Record<string, any>;
    pagination?: { page?: number; limit?: number };
  },
): Promise<string> {
  const { scope, resource, filters = {}, pagination = {} } = options;

  const version = await getCacheNamespace(cacheService, scope);
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;

  // Combine filters and pagination for hash
  const params = { ...filters, page, limit };
  const paramsHash = buildCacheHash(params);

  return `ns:v${version}:${scope}:${resource}:list:${paramsHash}`;
}


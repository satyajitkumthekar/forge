/**
 * Enhanced Cache - Two-Layer Caching System
 * L1: In-memory Map for instant access
 * L2: MMKV (native) / localStorage (web) for persistent storage
 *
 * Pattern: Stale-While-Revalidate
 * - Show cached data immediately (L1 or L2)
 * - Fetch fresh data in background
 * - Update cache with fresh data
 *
 * All keys are namespaced per user (`ft:<userId|anon>:<key>`) so data can
 * never leak between accounts on a shared device. L2 values are stored in a
 * `{ v, ts, ttl }` envelope so TTLs survive page reloads.
 */

import { cache as mmkvCache } from './cache';

// L1 Cache: In-memory cache for instant access
const memoryCache = new Map<string, any>();

// Cache metadata for TTL tracking
interface CacheMetadata {
  timestamp: number;
  ttl?: number; // Time-to-live in milliseconds (optional)
}
const metadataCache = new Map<string, CacheMetadata>();

// L2 envelope: persisted values carry their write time so TTLs keep counting
interface L2Envelope<T> {
  v: T;
  ts: number;
  ttl?: number;
}

const isEnvelope = (value: unknown): value is L2Envelope<unknown> =>
  value !== null && typeof value === 'object' && 'v' in (value as object) && 'ts' in (value as object);

// ============================================
// PER-USER NAMESPACING
// ============================================

const KEY_PREFIX = 'ft:';
let cacheUserId: string | null = null;

const k = (key: string): string => `${KEY_PREFIX}${cacheUserId ?? 'anon'}:${key}`;

/**
 * Bind the cache to the signed-in user. Call on every auth state change
 * (AuthContext does this). Switching users clears L1 so one account's data
 * is never served to another.
 */
export function setCacheUser(userId: string | null): void {
  if (userId === cacheUserId) return;
  cacheUserId = userId;
  memoryCache.clear();
  metadataCache.clear();

  if (userId) migrateLegacyKeys();
}

/**
 * One-time migration from the pre-namespacing key scheme. The offline queue
 * may hold unsynced food logs, so it is moved to the new key rather than
 * dropped; everything else is plain cache and safe to delete.
 */
function migrateLegacyKeys(): void {
  const legacyQueue = mmkvCache.get<unknown[]>('offline_queue');
  if (legacyQueue && Array.isArray(legacyQueue) && legacyQueue.length > 0) {
    mmkvCache.set(k(CACHE_KEYS.offlineQueue), { v: legacyQueue, ts: Date.now() });
  }

  const legacyKeys = ['offline_queue', 'user_settings', 'coach_messages', 'frequent_items', 'analytics_data'];
  for (const key of mmkvCache.getAllKeys()) {
    if (legacyKeys.includes(key) || key.startsWith('entries_')) {
      mmkvCache.delete(key);
    }
  }
}

// ============================================
// CORE API
// ============================================

/**
 * Get value from cache (checks L1 first, then L2). Expired values are
 * deleted and treated as a miss.
 */
export function getCached<T>(key: string): T | null {
  const nk = k(key);

  // Try L1 cache (memory) first - INSTANT
  if (memoryCache.has(nk)) {
    const metadata = metadataCache.get(nk);
    if (metadata?.ttl && Date.now() - metadata.timestamp > metadata.ttl) {
      // Expired — L2 holds the same write, so it's stale too
      memoryCache.delete(nk);
      metadataCache.delete(nk);
      mmkvCache.delete(nk);
      return null;
    }
    return memoryCache.get(nk) as T;
  }

  // Fall back to L2 cache - PERSISTENT
  const l2Value = mmkvCache.get<L2Envelope<T> | T>(nk);
  if (l2Value === null) return null;

  if (!isEnvelope(l2Value)) {
    // Unrecognized legacy shape — discard rather than serve unaged data
    mmkvCache.delete(nk);
    return null;
  }

  if (l2Value.ttl && Date.now() - l2Value.ts > l2Value.ttl) {
    mmkvCache.delete(nk);
    return null;
  }

  // Promote to L1 with the ORIGINAL timestamp so the TTL keeps counting
  // from the actual write, not from this read
  memoryCache.set(nk, l2Value.v);
  metadataCache.set(nk, { timestamp: l2Value.ts, ttl: l2Value.ttl });
  return l2Value.v as T;
}

/**
 * Set value in cache (writes to both L1 and L2)
 */
export function setCached<T>(key: string, value: T, ttl?: number): void {
  const nk = k(key);
  memoryCache.set(nk, value);
  metadataCache.set(nk, { timestamp: Date.now(), ttl });
  mmkvCache.set(nk, { v: value, ts: Date.now(), ttl } satisfies L2Envelope<T>);
}

/**
 * Check if cache key exists and is not expired
 */
export function hasCached(key: string): boolean {
  return getCached(key) !== null;
}

/**
 * Invalidate specific cache key (clears from L1 and L2)
 */
export function invalidate(key: string): void {
  const nk = k(key);
  memoryCache.delete(nk);
  metadataCache.delete(nk);
  mmkvCache.delete(nk);
}

/**
 * Invalidate cache keys matching a pattern (e.g., "entries_*")
 */
export function invalidatePattern(pattern: string): void {
  const regex = new RegExp(k(pattern).replace('*', '.*'));

  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      metadataCache.delete(key);
    }
  }
  for (const key of mmkvCache.getAllKeys()) {
    if (regex.test(key)) {
      mmkvCache.delete(key);
    }
  }
}

/**
 * Clear the current user's cached data (L1 and L2).
 * Called on sign-out so nothing lingers on shared devices.
 */
export function clearUserCache(): void {
  const prefix = `${KEY_PREFIX}${cacheUserId ?? 'anon'}:`;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      metadataCache.delete(key);
    }
  }
  for (const key of mmkvCache.getAllKeys()) {
    if (key.startsWith(prefix)) {
      mmkvCache.delete(key);
    }
  }
}

/**
 * Clear ALL app cache across users. Prefix-scoped on purpose: wiping all of
 * localStorage would also delete the Supabase auth token (sb-*) and log the
 * user out.
 */
export function clearAll(): void {
  memoryCache.clear();
  metadataCache.clear();
  for (const key of mmkvCache.getAllKeys()) {
    if (key.startsWith(KEY_PREFIX)) {
      mmkvCache.delete(key);
    }
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return {
    l1Size: memoryCache.size,
    l1Keys: Array.from(memoryCache.keys()),
  };
}

// Export cache keys for consistency (single source of truth — do not
// duplicate in lib/cache.ts)
export const CACHE_KEYS = {
  entries: (date: string) => `entries_${date}`,
  settings: 'user_settings',
  analytics: 'analytics_data',
  chatMessages: 'coach_messages',
  frequentItems: 'frequent_items',
  offlineQueue: 'offline_queue',
  accountType: 'account_type',
};

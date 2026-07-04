/**
 * Cache Layer for Web - localStorage implementation
 * ABSTRACTION: All local storage operations go through here
 */

// Web storage wrapper using localStorage
const webStorage = {
  getString: (key: string): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    return window.localStorage.getItem(key) || undefined;
  },
  set: (key: string, value: string): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
  delete: (key: string): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  },
  clearAll: (): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  },
  contains: (key: string): boolean => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(key) !== null;
  },
  getAllKeys: (): string[] => {
    if (typeof window === 'undefined') return [];
    return Object.keys(window.localStorage);
  },
};

export const cache = {
  /**
   * Get a value from cache
   */
  get: <T>(key: string): T | null => {
    try {
      const value = webStorage.getString(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Set a value in cache
   */
  set: <T>(key: string, value: T): void => {
    try {
      webStorage.set(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Cache set error for key "${key}":`, error);
    }
  },

  /**
   * Delete a value from cache
   */
  delete: (key: string): void => {
    try {
      webStorage.delete(key);
    } catch (error) {
      console.error(`Cache delete error for key "${key}":`, error);
    }
  },

  /**
   * Clear all cache
   */
  clear: (): void => {
    try {
      webStorage.clearAll();
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  },

  /**
   * Check if key exists
   */
  has: (key: string): boolean => {
    return webStorage.contains(key);
  },

  /**
   * Get all keys
   */
  getAllKeys: (): string[] => {
    return webStorage.getAllKeys();
  },
};

// CACHE_KEYS lives in lib/enhanced-cache.ts — the single source of truth.

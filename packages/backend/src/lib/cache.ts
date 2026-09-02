/**
 * Simple in-memory cache with TTL.
 * Drop-in replacement for Redis — same interface.
 * Swap to Redis/Upstash later when you need shared state.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize: number = 500;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Evict expired entries every 60s
    this.cleanupInterval = setInterval(() => this.evict(), 60_000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    if (this.store.size > this.maxSize) {
      // First pass: evict expired entries
      const now = Date.now();
      for (const [k, entry] of this.store) {
        if (now > entry.expiresAt) {
          this.store.delete(k);
        }
      }
      // Second pass: if still over limit, evict oldest by insertion order
      if (this.store.size > this.maxSize) {
        const excess = this.store.size - this.maxSize;
        let removed = 0;
        for (const k of this.store.keys()) {
          if (removed >= excess) break;
          this.store.delete(k);
          removed++;
        }
      }
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  private evict() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

export const cache = new MemoryCache();

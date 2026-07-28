import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";

/**
 * We need to test the MemoryCache class directly, but the module exports
 * a singleton `cache`. We'll import the module and test via the singleton,
 * cleaning up between tests.
 */

describe("MemoryCache bounded size", () => {
  // Use dynamic import so we can work with the singleton
  let cache: Awaited<typeof import("./cache.js")>["cache"];

  beforeEach(async () => {
    const mod = await import("./cache.js");
    cache = mod.cache;
  });

  afterEach(() => {
    // Clear all entries between tests
    cache.destroy();
  });

  it("should keep cache size <= 500 when inserting 501 entries", async () => {
    for (let i = 0; i < 501; i++) {
      await cache.set(`key-${i}`, `value-${i}`, 300);
    }

    // The most recent entry should still be accessible
    const latest = await cache.get<string>("key-500");
    expect(latest).toBe("value-500");

    // The very first entry should have been evicted
    const oldest = await cache.get<string>("key-0");
    expect(oldest).toBeNull();
  });

  it("should evict expired entries first before evicting non-expired", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    // Insert 498 entries with long TTL
    for (let i = 0; i < 498; i++) {
      await cache.set(`fresh-${i}`, `value-${i}`, 3600);
    }

    // Insert 2 entries that are already expired (TTL=0 won't work, need to mock time)
    // Set them with short TTL, then advance time
    await cache.set("expired-1", "gone-1", 1);
    await cache.set("expired-2", "gone-2", 1);

    // Now we have 500 entries. Advance time so the 2 expired entries are past TTL.
    vi.spyOn(Date, "now").mockReturnValue(now + 2000);

    // Insert 1 more — should trigger eviction. Expired entries should go first.
    await cache.set("new-entry", "new-value", 3600);

    // The new entry must be present
    const newEntry = await cache.get<string>("new-entry");
    expect(newEntry).toBe("new-value");

    // Expired entries should have been evicted
    const exp1 = await cache.get<string>("expired-1");
    const exp2 = await cache.get<string>("expired-2");
    expect(exp1).toBeNull();
    expect(exp2).toBeNull();

    // Fresh entries should still be present (expired ones were evicted first)
    const fresh0 = await cache.get<string>("fresh-0");
    expect(fresh0).toBe("value-0");

    vi.restoreAllMocks();
  });

  it("should retain the most recently inserted entries after eviction", async () => {
    // Fill to 500
    for (let i = 0; i < 500; i++) {
      await cache.set(`item-${i}`, i, 300);
    }

    // Add 10 more, pushing 10 oldest out
    for (let i = 500; i < 510; i++) {
      await cache.set(`item-${i}`, i, 300);
    }

    // The 10 newest should all be present
    for (let i = 500; i < 510; i++) {
      const val = await cache.get<number>(`item-${i}`);
      expect(val).toBe(i);
    }

    // The first 10 should be evicted
    for (let i = 0; i < 10; i++) {
      const val = await cache.get<number>(`item-${i}`);
      expect(val).toBeNull();
    }
  });
});

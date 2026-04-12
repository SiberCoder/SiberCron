/**
 * Tracks engine-executionId → api-executionId mappings with a 2-hour TTL.
 * Exported as a singleton so app.ts, workflow routes, and queueService
 * can all reference the same map without going through globalThis.
 */

class TtlMap<K, V> {
  private readonly data = new Map<K, V>();
  private readonly timestamps = new Map<K, number>();

  set(key: K, value: V): this {
    this.timestamps.set(key, Date.now());
    this.data.set(key, value);
    return this;
  }

  get(key: K): V | undefined { return this.data.get(key); }
  has(key: K): boolean { return this.data.has(key); }
  delete(key: K): boolean {
    this.timestamps.delete(key);
    return this.data.delete(key);
  }
  [Symbol.iterator](): IterableIterator<[K, V]> { return this.data[Symbol.iterator](); }

  evictExpired(ttlMs: number): void {
    const cutoff = Date.now() - ttlMs;
    for (const [key, ts] of this.timestamps) {
      if (ts < cutoff) {
        this.data.delete(key);
        this.timestamps.delete(key);
      }
    }
  }
}

export const executionIdMap = new TtlMap<string, string>();

// Periodic TTL cleanup every 30 minutes (2-hour TTL)
setInterval(() => executionIdMap.evictExpired(2 * 60 * 60 * 1000), 30 * 60_000).unref();

import { Injectable } from '@nestjs/common';
import type {
  ThrottleIncrementResult,
  ThrottleStore,
} from './throttle-store.interface';

type Entry = { count: number; expiresAt: number };

@Injectable()
export class InMemoryThrottleStore implements ThrottleStore {
  private readonly buckets = new Map<string, Entry>();

  async increment(key: string, ttlMs: number): Promise<ThrottleIncrementResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.expiresAt <= now) {
      const entry = { count: 1, expiresAt: now + ttlMs };
      this.buckets.set(key, entry);
      return { totalHits: 1, ttlMs };
    }
    existing.count += 1;
    const remaining = Math.max(1, existing.expiresAt - now);
    return { totalHits: existing.count, ttlMs: remaining };
  }

  /** Test-only: reset counters between isolated smoke scenarios. */
  clearBuckets(): void {
    this.buckets.clear();
  }
}

import { Injectable } from '@nestjs/common';

/**
 * Process-local mutex keyed by refresh identity.
 * Swap for Redis Redlock when running multiple API instances.
 */
@Injectable()
export class DashboardRefreshLockService {
  private readonly tails = new Map<string, Promise<void>>();

  /** Serialize work per `key` across the Node process. */
  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let done!: () => void;
    const next = new Promise<void>((r) => {
      done = r;
    });
    this.tails.set(key, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      done();
    }
  }
}

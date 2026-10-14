import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import type {
  ThrottleIncrementResult,
  ThrottleStore,
} from './throttle-store.interface';
import { InMemoryThrottleStore } from './in-memory-throttle.store';

type RedisClient = {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  quit(): Promise<string>;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

@Injectable()
export class RedisThrottleStore implements ThrottleStore, OnModuleDestroy {
  private client: RedisClient | null = null;
  private connected = false;
  private readonly fallback = new InMemoryThrottleStore();

  constructor(private readonly protectionLogger: ProtectionLoggerService) {}

  async connect(redisUrl: string): Promise<boolean> {
    const maskedUrl = redisUrl.replace(/:[^:@/]+@/, ':***@');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IORedis = require('ioredis') as new (
        url: string,
        options?: Record<string, unknown>,
      ) => RedisClient & { connect(): Promise<void> };

      const client = new IORedis(redisUrl, {
        maxRetriesPerRequest: 0,
        connectTimeout: 1_000,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      client.on('error', (err: unknown) => {
        this.connected = false;
        this.protectionLogger.logEvent(ProtectionLogEvent.REDIS_DISCONNECTED, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      client.on('connect', () => {
        this.connected = true;
        this.protectionLogger.logStartup(ProtectionLogEvent.REDIS_CONNECTED, {
          url: maskedUrl,
        });
      });

      await client.connect();
      this.client = client;
      this.connected = true;
      return true;
    } catch (err) {
      this.client = null;
      this.connected = false;
      this.protectionLogger.logEvent(ProtectionLogEvent.REDIS_THROTTLE_FAILURE, {
        fallback: 'in-memory',
        error: err instanceof Error ? err.message : String(err),
      });
      this.protectionLogger.logEvent(ProtectionLogEvent.FALLBACK_MODE, {
        mode: 'local-memory-throttling',
        reason: 'redis-unavailable',
      });
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async increment(key: string, ttlMs: number): Promise<ThrottleIncrementResult> {
    if (!this.client || !this.connected) {
      return this.fallback.increment(key, ttlMs);
    }
    try {
      const totalHits = await this.client.incr(`fris:throttle:${key}`);
      if (totalHits === 1) {
        await this.client.pexpire(`fris:throttle:${key}`, ttlMs);
      }
      return { totalHits, ttlMs };
    } catch (err) {
      this.connected = false;
      this.protectionLogger.logEvent(ProtectionLogEvent.REDIS_THROTTLE_FAILURE, {
        fallback: 'in-memory',
        error: err instanceof Error ? err.message : String(err),
      });
      return this.fallback.increment(key, ttlMs);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* ignore shutdown errors */
      }
    }
  }
}

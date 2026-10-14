import { Injectable, OnModuleDestroy } from '@nestjs/common';

type OtpEntry = { hash: string; expiresAt: number; tries: number; used?: boolean };

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttlMs: number): Promise<string>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  quit(): Promise<string>;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

@Injectable()
export class OtpStoreService implements OnModuleDestroy {
  private readonly memory = new Map<string, OtpEntry>();
  private readonly rateMemory = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  private redis: RedisClient | null = null;
  private redisReady = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl) {
      void this.connectRedis(redisUrl);
    }
  }

  private async connectRedis(redisUrl: string): Promise<void> {
    try {
      const IORedis = require('ioredis') as new (url: string) => RedisClient;
      const client = new IORedis(redisUrl);
      client.on('connect', () => {
        this.redisReady = true;
      });
      client.on('error', () => {
        this.redisReady = false;
      });
      this.redis = client;
    } catch {
      this.redis = null;
      this.redisReady = false;
    }
  }

  private otpKey(key: string): string {
    return `fris:otp:${key}`;
  }

  private rateKey(key: string): string {
    return `fris:otp-rate:${key}`;
  }

  async getOtp(key: string): Promise<OtpEntry | null> {
    if (this.redis && this.redisReady) {
      const raw = await this.redis.get(this.otpKey(key));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as OtpEntry;
      } catch {
        return null;
      }
    }
    return this.memory.get(key) ?? null;
  }

  async setOtp(key: string, entry: OtpEntry, ttlMs: number): Promise<void> {
    if (this.redis && this.redisReady) {
      await this.redis.set(
        this.otpKey(key),
        JSON.stringify(entry),
        'PX',
        ttlMs,
      );
      return;
    }
    this.memory.set(key, entry);
  }

  async deleteOtp(key: string): Promise<void> {
    if (this.redis && this.redisReady) {
      await this.redis.del(this.otpKey(key));
      return;
    }
    this.memory.delete(key);
  }

  async incrementRate(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; windowStartedAt: number }> {
    if (this.redis && this.redisReady) {
      const redisKey = this.rateKey(key);
      const count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.pexpire(redisKey, windowMs);
      }
      return { count, windowStartedAt: Date.now() };
    }

    const now = Date.now();
    const existing = this.rateMemory.get(key);
    if (!existing || now - existing.windowStartedAt >= windowMs) {
      const next = { count: 1, windowStartedAt: now };
      this.rateMemory.set(key, next);
      return next;
    }
    existing.count += 1;
    return existing;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

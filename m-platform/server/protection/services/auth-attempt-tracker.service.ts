import { Inject, Injectable } from '@nestjs/common';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import {
  PROTECTION_ENV,
  type ProtectionEnv,
} from '../config/protection-env';

type AttemptBucket = { count: number; windowStartedAt: number };

@Injectable()
export class AuthAttemptTrackerService {
  private readonly buckets = new Map<string, AttemptBucket>();
  private readonly windowMs = 15 * 60 * 1000;

  constructor(
    private readonly protectionLogger: ProtectionLoggerService,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  recordFailedLogin(userId: string, ip: string, requestId?: string): void {
    if (!this.env.enableSecurityLogging) return;

    const key = `${userId.toLowerCase()}::${ip}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    const next: AttemptBucket =
      !bucket || now - bucket.windowStartedAt >= this.windowMs
        ? { count: 1, windowStartedAt: now }
        : { ...bucket, count: bucket.count + 1 };
    this.buckets.set(key, next);

    if (next.count >= this.env.authFailedAttemptsThreshold) {
      this.protectionLogger.logEvent(
        ProtectionLogEvent.AUTH_SUSPICIOUS_ACTIVITY,
        {
          userId,
          attempts: next.count,
          ip,
          requestId,
          timestamp: new Date().toISOString(),
          securityIssue: true,
        },
      );
    }
  }
}

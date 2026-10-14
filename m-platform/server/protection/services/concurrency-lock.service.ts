import {
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import {
  PROTECTION_ENV,
  type ProtectionEnv,
} from '../config/protection-env';
import type { ThrottleEnforcementMode } from '../config/protection-env';

export type ConcurrencyOperation = 'bulk-import' | 'bulk-export';

@Injectable()
export class ConcurrencyLockService {
  private readonly active = new Map<ConcurrencyOperation, Set<string>>();

  constructor(
    private readonly protectionLogger: ProtectionLoggerService,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  tryAcquire(
    operation: ConcurrencyOperation,
    holderId: string,
    options: {
      maxConcurrent: number;
      enabled: boolean;
      mode: ThrottleEnforcementMode;
      route?: string;
      requestId?: string;
    },
  ): { acquired: boolean; activeJobs: number } {
    if (!options.enabled) {
      return { acquired: true, activeJobs: 0 };
    }

    const holders = this.active.get(operation) ?? new Set<string>();
    const alreadyHeld = holders.has(holderId);
    const activeJobs = holders.size;

    if (!alreadyHeld && activeJobs >= options.maxConcurrent) {
      this.protectionLogger.logEvent(ProtectionLogEvent.CONCURRENCY_BLOCKED, {
        operation,
        activeJobs,
        blockedUser: holderId,
        route: options.route,
        requestId: options.requestId,
        maxConcurrent: options.maxConcurrent,
      });

      if (options.mode === 'enforcement') {
        throw new ConflictException(
          `${operation} is already running. Try again shortly.`,
        );
      }

      if (options.mode === 'warn-only') {
        this.protectionLogger.logEvent(ProtectionLogEvent.THROTTLE_WARN_ONLY, {
          wouldBlock: true,
          operation,
          blockedUser: holderId,
        });
      } else {
        this.protectionLogger.logEvent(ProtectionLogEvent.THROTTLE_MONITOR_ONLY, {
          wouldBlock: true,
          operation,
          blockedUser: holderId,
        });
      }

      return { acquired: true, activeJobs };
    }

    if (!alreadyHeld) {
      holders.add(holderId);
      this.active.set(operation, holders);
    }
    return { acquired: true, activeJobs: holders.size };
  }

  release(operation: ConcurrencyOperation, holderId: string): void {
    const holders = this.active.get(operation);
    if (!holders) return;
    holders.delete(holderId);
    if (holders.size === 0) {
      this.active.delete(operation);
    }
  }

  isImportControlEnabled(): boolean {
    return this.env.enableImportConcurrencyControl;
  }

  isExportControlEnabled(): boolean {
    return this.env.enableExportConcurrencyControl;
  }
}

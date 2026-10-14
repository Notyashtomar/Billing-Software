import {
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type { Connection } from 'mongoose';
import { formatMemoryFields } from './utils/format-bytes.util';
import { formatDuration } from './utils/format-duration.util';

export type LivenessPayload = {
  status: 'ok';
  timestamp: string;
  /** Raw + human uptime — operators read `human`; monitors use `seconds`. */
  uptime: {
    seconds: number;
    human: string;
  };
};

/**
 * Operational health helpers — no business logic or collection scans.
 */
@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {}

  /**
   * Subscribe to Mongo driver events for structured readiness logging.
   * Readiness itself is evaluated by {@link MongooseHealthIndicator.pingCheck}.
   */
  onModuleInit(): void {
    if (!this.connection) {
      this.logger.warn(
        '[READINESS] mongoose connection not available; /ready will fail until Mongo is wired',
      );
      return;
    }

    this.connection.on('connected', () => {
      this.logger.log('[READINESS] mongodb connected');
    });

    this.connection.on('disconnected', () => {
      this.logger.warn('[READINESS] mongodb disconnected');
    });

    this.connection.on('reconnected', () => {
      this.logger.log('[READINESS] mongodb reconnected');
    });

    this.connection.on('error', (err: Error) => {
      this.logger.error(
        `[READINESS] mongodb error message=${err?.message ?? String(err)}`,
      );
    });
  }

  /** Lightweight liveness payload — no database I/O. */
  getLiveness(): LivenessPayload {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: formatDuration(process.uptime()),
    };
  }

  /**
   * Process/runtime details for {@code GET /health/full}.
   * Includes dual raw + human fields so curl output is readable without a calculator.
   */
  async processDetailsCheck(): Promise<HealthIndicatorResult<'process'>> {
    const indicator = this.healthIndicatorService.check('process');
    const memory = process.memoryUsage();

    return indicator.up({
      pid: process.pid,
      nodeVersion: process.version,
      uptime: formatDuration(process.uptime()),
      memory: formatMemoryFields({
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      }),
    });
  }

  logReadinessFailure(reason: string, detail?: unknown): void {
    const detailText =
      detail === undefined
        ? ''
        : ` detail=${JSON.stringify(detail)}`;
    this.logger.warn(`[READINESS] check failed reason=${reason}${detailText}`);
  }
}

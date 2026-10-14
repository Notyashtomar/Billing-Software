import { Injectable, Logger } from '@nestjs/common';

export type WarmPhase =
  | 'idle'
  | 'phase1_critical'
  | 'phase2_secondary'
  | 'phase3_deferred'
  | 'complete'
  | 'error';

export interface WarmPhaseResult {
  phase: string;
  enqueued: number;
  skippedFresh: number;
  durationMs: number;
  completedAt: Date;
}

export interface WarmStatusSnapshot {
  currentPhase: WarmPhase;
  startedAt: Date | null;
  completedAt: Date | null;
  phases: WarmPhaseResult[];
  totalEnqueued: number;
  totalSkippedFresh: number;
  lastError: string | null;
}

/**
 * Tracks the lifecycle state of the startup dashboard warm across phases.
 * Provides a plain-object snapshot suitable for an admin diagnostics endpoint.
 */
@Injectable()
export class DashboardWarmStateService {
  private readonly logger = new Logger(DashboardWarmStateService.name);

  private currentPhase: WarmPhase = 'idle';
  private startedAt: Date | null = null;
  private completedAt: Date | null = null;
  private readonly completedPhases: WarmPhaseResult[] = [];
  private totalEnqueued = 0;
  private totalSkippedFresh = 0;
  private lastError: string | null = null;

  onWarmStart(): void {
    this.currentPhase = 'idle';
    this.startedAt = new Date();
    this.completedAt = null;
    this.completedPhases.length = 0;
    this.totalEnqueued = 0;
    this.totalSkippedFresh = 0;
    this.lastError = null;
    this.logger.log('[DashboardWarmState] startup_warm_started');
  }

  onPhaseStart(phase: WarmPhase): void {
    this.currentPhase = phase;
    this.logger.log(`[DashboardWarmState] phase_start phase=${phase}`);
  }

  onPhaseComplete(result: WarmPhaseResult): void {
    this.completedPhases.push(result);
    this.totalEnqueued += result.enqueued;
    this.totalSkippedFresh += result.skippedFresh;
    this.logger.log(
      `[DashboardWarmState] phase_complete phase=${result.phase} ` +
        `enqueued=${result.enqueued} skippedFresh=${result.skippedFresh} ` +
        `durationMs=${result.durationMs}`,
    );
  }

  onWarmComplete(): void {
    this.currentPhase = 'complete';
    this.completedAt = new Date();
    this.logger.log(
      `[DashboardWarmState] startup_warm_complete ` +
        `totalEnqueued=${this.totalEnqueued} totalSkippedFresh=${this.totalSkippedFresh} ` +
        `phases=${this.completedPhases.length}`,
    );
  }

  onWarmError(err: unknown): void {
    this.currentPhase = 'error';
    this.lastError = err instanceof Error ? err.message : String(err);
    this.logger.warn(`[DashboardWarmState] startup_warm_error: ${this.lastError}`);
  }

  snapshot(): WarmStatusSnapshot {
    return {
      currentPhase: this.currentPhase,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      phases: [...this.completedPhases],
      totalEnqueued: this.totalEnqueued,
      totalSkippedFresh: this.totalSkippedFresh,
      lastError: this.lastError,
    };
  }
}

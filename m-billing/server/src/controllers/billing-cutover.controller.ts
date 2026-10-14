import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { BillingCutoverService } from '../services/billing-cutover.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  BackfillPreparationDto,
  CaptureParallelSnapshotDto,
  CutoverReconciliationQueryDto,
  ExecuteDecommissionDto,
  ImportBcBaselineDto,
  ListParallelSnapshotsQueryDto,
  RollbackDecommissionDto,
  SignOffParallelPeriodDto,
  UpdateCutoverSettingsDto,
} from '../dto/billing-cutover.dto';
import { BillingParallelRunService } from '../services/billing-parallel-run.service';
import { BillingDecommissionService } from '../services/billing-decommission.service';

/**
 * Phase 6 — migration & cutover (parallel run with BC).
 * FRIS: /billing/cutover
 */
import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/cutover')
export class BillingCutoverController {
  constructor(
    private readonly cutoverService: BillingCutoverService,
    private readonly parallelRunService: BillingParallelRunService,
    private readonly decommissionService: BillingDecommissionService,
  ) {}

  @Get('status')
  status(@CurrentBillingStation() station: StationScopeContext) {
    return this.cutoverService.getStatus(station);
  }

  @Get('reconciliation')
  reconciliation(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: CutoverReconciliationQueryDto,
  ) {
    return this.cutoverService.getReconciliation(station, query);
  }

  @Post('backfill')
  backfill(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BackfillPreparationDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.cutoverService.backfillFromExportedNav(station, dto, actor);
  }

  @Patch('settings')
  updateSettings(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: UpdateCutoverSettingsDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.cutoverService.updateSettings(station, dto, actor);
  }

  @Post('import-bc-baseline')
  importBcBaseline(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: ImportBcBaselineDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.cutoverService.importBcBaseline(station, dto, actor);
  }

  @Get('snapshots')
  listSnapshots(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListParallelSnapshotsQueryDto,
  ) {
    return this.parallelRunService.listSnapshots(station, query);
  }

  @Post('snapshots')
  captureSnapshot(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CaptureParallelSnapshotDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.parallelRunService.captureSnapshot(station, dto, actor);
  }

  @Post('sign-off')
  signOff(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: SignOffParallelPeriodDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.parallelRunService.signOffPeriod(station, dto, actor);
  }

  @Post('start-parallel-run')
  startParallelRun(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.parallelRunService.startParallelRun(station, actor);
  }

  @Get('decommission/readiness')
  decommissionReadiness(@CurrentBillingStation() station: StationScopeContext) {
    return this.decommissionService.getReadiness(station);
  }

  @Get('legacy-export-policy')
  legacyExportPolicy(@CurrentBillingStation() station: StationScopeContext) {
    return this.decommissionService.getLegacyExportPolicy(station);
  }

  @Get('decommission/records')
  decommissionRecords(@CurrentBillingStation() station: StationScopeContext) {
    return this.decommissionService.listRecords(station);
  }

  @Post('decommission')
  executeDecommission(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: ExecuteDecommissionDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.decommissionService.executeDecommission(station, dto, actor);
  }

  @Post('decommission/rollback')
  rollbackDecommission(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: RollbackDecommissionDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.decommissionService.rollbackDecommission(station, dto, actor);
  }
}


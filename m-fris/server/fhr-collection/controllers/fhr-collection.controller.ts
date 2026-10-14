import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  BadRequestException,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import { FLIGHT_FORM_PAGE_PERMISSIONS } from '../../auth/decorators/flight-form-page-permissions';
import {
  OPERATIONAL_ROLES,
  REPORT_VIEW_ROLES,
} from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import { FhrCollectionService } from '../services/fhr-collection.service';
import { UpsertFhrCollectionDto } from '../dto/upsert-fhr-collection.dto';
import { SharedReportsEmailService } from '../services/shared-reports-email.service';
import { SendSharedReportsEmailDto } from '../dto/send-shared-reports-email.dto';
import { SendFhrReportEmailDto } from '../dto/send-fhr-report-email.dto';
import { PaxShiftReportEmailService } from '../../reports-pax-shift-report/services/pax-shift-report-email.service';
import {
  FhrSignatureService,
  type FhrSignatureActor,
} from '../services/fhr-signature.service';
import { SaveFhrSignatureDto } from '../dto/save-fhr-signature.dto';
import { AssignFhrSignatureDto } from '../dto/assign-fhr-signature.dto';
import { BatchSerialsDto } from '../dto/batch-serials.dto';
import type { AssignReportType } from '../../representative-signatures/services/representative-signature.service';

const bodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

function mapReportType(
  report: string | undefined,
): AssignReportType | undefined {
  switch (
    String(report ?? '')
      .trim()
      .toLowerCase()
  ) {
    case 'gse':
      return 'GSE';
    case 'team':
    case 'team_report':
      return 'TEAM_REPORT';
    case 'fhr':
      return 'FHR';
    default:
      return undefined;
  }
}

@Controller('fhr-collection')
export class FhrCollectionController {
  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly sharedReportsEmailService: SharedReportsEmailService,
    private readonly fhrSignatureService: FhrSignatureService,
    private readonly reportEmailService: PaxShiftReportEmailService,
  ) {}

  private buildSignatureActor(
    user: AuthenticatedPrincipal | undefined,
    req: { headers?: Record<string, unknown> },
  ): FhrSignatureActor {
    if (!user?.userId) {
      throw new BadRequestException('Authenticated user is required.');
    }
    return {
      userId: String(user.userId),
      userName: String(user.name ?? user.email ?? 'User'),
      userEmail: user.email,
      accountType: user.accountType === 'admin' ? 'admin' : 'user',
      ipAddress: extractClientIp(req.headers ?? {}),
      userAgent:
        String((req.headers ?? {})['user-agent'] ?? '').trim() || undefined,
    };
  }

  private validateSerial(serialNo: string): number {
    const trimmed = String(serialNo ?? '')
      .trim()
      .replace(/^FL-/i, '');
    const serial = Number(trimmed);
    if (!trimmed || Number.isNaN(serial)) {
      throw new BadRequestException('Invalid flight serial number');
    }
    return serial;
  }

  @Get('flight/:serialNo')
  @Roles(...REPORT_VIEW_ROLES)
  getOne(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.fhrCollectionService.findBySerial(serial, station);
  }

  /**
   * Batch FHR doc lookup — one query for many candidate serials instead of one
   * request per flight. Powers the Scheduled data export page (Flight Schedule +
   * Equipment tabs), which previously issued N sequential per-flight probes.
   * Returns only the serials that resolved to a document (missing = not found).
   */
  @Post('flights-batch')
  @Roles(...REPORT_VIEW_ROLES)
  async getManyBySerial(
    @Body(bodyPipe) body: BatchSerialsDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const map = await this.fhrCollectionService.getLeanFhrDocsBatch(
      body.serials,
      station,
    );
    const out: Record<string, Record<string, unknown>> = {};
    for (const [serial, doc] of map) {
      out[String(serial)] = doc;
    }
    return out;
  }

  /** Read-only cleaning-services rows from FHR flights in the selected STA date window. */
  @Get('cleaning-services')
  @Roles(...OPERATIONAL_ROLES)
  listCleaningServices(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate);
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException(
        'fromDate and tillDate are required (yyyy-MM-dd or dd/MM/yyyy)',
      );
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException('fromDate must be on or before tillDate');
    }
    return this.fhrCollectionService.listCleaningServicesForStaYmdWindow(
      fromYmd,
      toYmd,
      station,
    );
  }

  /**
   * Merge the provided form sections into `fhr_collection` for this flight (partial update of nested objects).
   */
  @Put('flight/:serialNo')
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  upsert(
    @Param('serialNo') serialNo: string,
    @Body() body: UpsertFhrCollectionDto,
    @CurrentStation() station: StationScopeContext,
    @Query('reason') reason?: string,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.fhrCollectionService.upsertMerge(
      serial,
      body,
      reason?.trim() || 'api_upsert',
      station,
    );
  }

  /**
   * Rebuild the FHR document from all underlying form collections (main, terminal, load, ramp×3, remarks, etc.).
   */
  @Post('flight/:serialNo/refresh-from-sources')
  @Roles(...OPERATIONAL_ROLES)
  refresh(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
    @Query('reason') reason?: string,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.fhrCollectionService.refreshFromSourceCollections(
      serial,
      reason?.trim() || 'api_refresh',
      undefined,
      station,
    );
  }

  @Post('flight/:serialNo/send-report-email')
  @Roles(...REPORT_VIEW_ROLES)
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  sendReportEmail(
    @Param('serialNo') serialNo: string,
    @Body(bodyPipe) body: SendFhrReportEmailDto,
  ) {
    const serial = String(this.validateSerial(serialNo));
    const flightNo = String(body.flightNo ?? '').trim();
    const airline = String(body.airline ?? '').trim();
    return this.reportEmailService.sendReportEmail({
      flightSerial: serial.slice(0, 64),
      airline,
      flightNo,
      emails: [body.recipientEmail],
      pdfBase64: body.pdfBase64,
      pdfFilename: body.pdfFilename,
      subject: `FHR Report - ${flightNo || serial}${airline ? ` - ${airline}` : ''}`,
    });
  }

  /**
   * Email shared reports when the user opted in via Main Details and all operational locks are complete.
   * Idempotent per `shareTarget` (`airline-fhr` | `gh-rep-bundle`).
   */
  @Post('flight/:serialNo/share-reports-email')
  @Roles(...OPERATIONAL_ROLES)
  sendSharedReportsEmail(
    @Param('serialNo') serialNo: string,
    @Body(bodyPipe) body: SendSharedReportsEmailDto,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.sharedReportsEmailService.sendForFlight(serial, body);
  }

  /** Current GH + Airline representative signatures and finalization status. */
  @Get('flight/:serialNo/signatures')
  @Roles(...REPORT_VIEW_ROLES)
  getSignatures(@Param('serialNo') serialNo: string) {
    const serial = this.validateSerial(serialNo);
    return this.fhrSignatureService.getSignatures(serial);
  }

  /** Save / replace a single representative signature (auto-saved with the draft). */
  @Put('flight/:serialNo/signature')
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  saveSignature(
    @Param('serialNo') serialNo: string,
    @Body(bodyPipe) body: SaveFhrSignatureDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @CurrentStation() station: StationScopeContext,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const serial = this.validateSerial(serialNo);
    return this.fhrSignatureService.saveSignature(
      serial,
      body,
      this.buildSignatureActor(user, req),
      station,
    );
  }

  /** Assign an existing reusable repository signature ("Use Existing Signature"). */
  @Put('flight/:serialNo/signature/assign')
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  assignSignature(
    @Param('serialNo') serialNo: string,
    @Body(bodyPipe) body: AssignFhrSignatureDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @CurrentStation() station: StationScopeContext,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const serial = this.validateSerial(serialNo);
    return this.fhrSignatureService.assignExistingSignature(
      serial,
      body.party,
      body.signatureId,
      this.buildSignatureActor(user, req),
      station,
    );
  }

  /**
   * Render-ready signatures for PDF generation. `report` controls which
   * assignment audit event (if any) is recorded: gse | team | fhr.
   */
  @Get('flight/:serialNo/resolved-signatures')
  @Roles(...REPORT_VIEW_ROLES)
  resolvedSignatures(
    @Param('serialNo') serialNo: string,
    @Query('report') report: string | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const serial = this.validateSerial(serialNo);
    const reportType = mapReportType(report);
    const actor =
      reportType && reportType !== 'FHR'
        ? this.buildSignatureActor(user, req)
        : undefined;
    return this.fhrSignatureService.resolveForFlight(serial, reportType, actor);
  }

  /** Finalize the FHR once both signatures exist — disables further signature edits. */
  @Post('flight/:serialNo/finalize')
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  finalize(
    @Param('serialNo') serialNo: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const serial = this.validateSerial(serialNo);
    return this.fhrSignatureService.finalize(
      serial,
      this.buildSignatureActor(user, req),
    );
  }
}

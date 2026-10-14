import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../auth/enums/roles.enum';
import { FlightCancellationsService } from './flight-cancellations.service';
import {
  CancelFlightDto,
  RemoveCancellationDto,
  SendCancellationInfoByDetailsDto,
} from './dto/cancel-flight.dto';
import { CurrentStation } from '../common/station/current-station.decorator';
import type { StationScopeContext } from '../common/station/station-scope';
import { buildContentDisposition } from './utils/cancellation-attachment.util';

@Controller('flights')
export class FlightCancellationsController {
  constructor(
    private readonly flightCancellationsService: FlightCancellationsService,
  ) {}

  /** Date-specific cancel: inserts into `flight_cancellations` only. */
  @Post('cancel')
  @Roles(...ADMIN_ROLES)
  cancel(
    @Body() body: CancelFlightDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.flightCancellationsService.create(body, station);
  }

  @Get('cancellations')
  list(
    @CurrentStation() station: StationScopeContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kind') kind?: string,
  ) {
    return this.flightCancellationsService.findByDateRange(
      from ?? '',
      to ?? '',
      station,
      kind,
    );
  }

  /** Return every cancellation row from `flight_cancellations`. */
  @Get('cancellations/all')
  listAll(
    @CurrentStation() station: StationScopeContext,
    @Query('kind') kind?: string,
  ) {
    return this.flightCancellationsService.findAll(station, kind);
  }

  /**
   * Send cancellation info email from explicit fields (no `flight_cancellations` row), e.g. FHR snapshot rows.
   * Must be registered before `cancellations/:id/send-email`.
   */
  @Post('cancellations/send-email-by-details')
  @Roles(...ADMIN_ROLES)
  sendCancellationInfoEmailByDetails(
    @Body() body: SendCancellationInfoByDetailsDto,
  ) {
    return this.flightCancellationsService.sendCancellationInfoEmailByDetails(
      body,
    );
  }

  /**
   * Stream the proof file uploaded when the flight was cancelled.
   * Station-scoped; 404 when the row has no stored attachment.
   */
  @Get('cancellations/:id/attachment')
  async getAttachment(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @CurrentStation() station: StationScopeContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.flightCancellationsService.getAttachment(
      id,
      station,
    );
    const asDownload = ['1', 'true', 'yes'].includes(
      String(download ?? '')
        .trim()
        .toLowerCase(),
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition(
        asDownload ? 'attachment' : 'inline',
        file.fileName,
      ),
    );
    return new StreamableFile(file.data);
  }

  /** Send one cancellation row details to recipient email. */
  @Post('cancellations/:id/send-email')
  @Roles(...ADMIN_ROLES)
  sendCancellationInfoEmail(
    @Param('id') id: string,
    @Body() body: { emails?: string[]; email?: string },
    @CurrentStation() station: StationScopeContext,
  ) {
    const emails = Array.isArray(body?.emails)
      ? body.emails
      : String(body?.email ?? '')
          .split(/[,\n;]+/)
          .map((v) => v.trim())
          .filter(Boolean);
    return this.flightCancellationsService.sendCancellationInfoEmail(
      id,
      emails,
      station,
    );
  }

  /** UI status by serial: true if any row exists in `flight_cancellations`. */
  @Get('cancel/status/:flightId')
  async status(
    @Param('flightId') flightId: string,
    @CurrentStation() station: StationScopeContext,
    @Query('kind') kind?: string,
  ) {
    const isCancelled = await this.flightCancellationsService.isSerialCancelled(
      flightId,
      station,
      kind,
    );
    return { flightId: String(flightId ?? '').trim(), isCancelled };
  }

  @Delete('cancel')
  @Roles(...ADMIN_ROLES)
  reopen(
    @Body() body: RemoveCancellationDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.flightCancellationsService.remove(
      body.flightId,
      body.date,
      station,
    );
  }
}

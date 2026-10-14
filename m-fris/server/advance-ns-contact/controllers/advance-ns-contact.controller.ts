import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { AdvanceNsContactService } from '../services/advance-ns-contact.service';
import { AdvanceNonScheduledAirlineService } from '../../advance-non-scheduled-airline/services/advance-non-scheduled-airline.service';
import { CreateAdvanceNsContactDto } from '../dto/create-advance-ns-contact.dto';
import { BulkCreateAdvanceNsContactItemDto } from '../dto/bulk-create-advance-ns-contact.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import type { SignatureActor } from '../../representative-signatures/services/representative-signature.service';

@FrisPagePermission('advance', 'Airline Contact')
@Controller('advance-ns-contact')
export class AdvanceNsContactController {
  constructor(
    private readonly advanceNsContactService: AdvanceNsContactService,
    private readonly advanceNonScheduledAirlineService: AdvanceNonScheduledAirlineService,
  ) {}

  private buildActor(
    user: AuthenticatedPrincipal | undefined,
    req: { headers?: Record<string, unknown> },
  ): SignatureActor | undefined {
    if (!user?.userId) return undefined;
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

  /** Station-scoped non-scheduled airlines for Contact dropdowns. */
  @Get('reference/airlines')
  listAirlinesForContact(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceNonScheduledAirlineService.findAll(filter, station);
  }

  @Post()
  create(
    @Body() dto: CreateAdvanceNsContactDto,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceNsContactService.create(
      dto,
      station,
      this.buildActor(user, req),
    );
  }

  @Post('bulk')
  createBulk(
    @Body()
    body:
      | BulkCreateAdvanceNsContactItemDto[]
      | { rows: BulkCreateAdvanceNsContactItemDto[] },
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: BulkCreateAdvanceNsContactItemDto[] }).rows ?? []);
    return this.advanceNsContactService.createBulk(
      rows,
      station,
      this.buildActor(user, req),
    );
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceNsContactService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNsContactService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceNsContactDto>,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceNsContactService.update(
      id,
      dto,
      station,
      this.buildActor(user, req),
    );
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNsContactService.remove(id, station);
  }
}

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
import { AdvanceContactService } from '../services/advance-contact.service';
import { AdvanceAirlineService } from '../../advance-airline/services/advance-airline.service';
import { CreateAdvanceContactDto } from '../dto/create-advance-contact.dto';
import { BulkCreateAdvanceContactItemDto } from '../dto/bulk-create-advance-contact.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import type { SignatureActor } from '../../representative-signatures/services/representative-signature.service';

@FrisPagePermission('advance', 'Airline Contact')
@Controller('advance-contact')
export class AdvanceContactController {
  constructor(
    private readonly advanceContactService: AdvanceContactService,
    private readonly advanceAirlineService: AdvanceAirlineService,
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

  /** Station-scoped airlines for Contact dropdowns. */
  @Get('reference/airlines')
  listAirlinesForContact(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceAirlineService.findAll(filter, station);
  }

  @Post()
  create(
    @Body() dto: CreateAdvanceContactDto,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceContactService.create(
      dto,
      station,
      this.buildActor(user, req),
    );
  }

  @Post('bulk')
  createBulk(
    @Body()
    body:
      | BulkCreateAdvanceContactItemDto[]
      | { rows: BulkCreateAdvanceContactItemDto[] },
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: BulkCreateAdvanceContactItemDto[] }).rows ?? []);
    return this.advanceContactService.createBulk(
      rows,
      station,
      this.buildActor(user, req),
    );
  }

  /** Representatives available in FHR Main Details (master + flight usage). */
  @Get('representatives')
  listFhrRepresentatives(@CurrentStation() station: StationScopeContext) {
    return this.advanceContactService.listFhrRepresentatives(station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceContactService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceContactService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceContactDto>,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceContactService.update(
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
    return this.advanceContactService.remove(id, station);
  }
}

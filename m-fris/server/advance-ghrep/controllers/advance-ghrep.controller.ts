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
import {
  FrisPagePermission,
  FrisPagePermissionAny,
} from '../../auth/decorators/fris-page-permission.decorator';
import { GH_REP_LOOKUP_PAGE_PERMISSIONS } from '../../auth/decorators/flight-form-page-permissions';
import { AdvanceGhrepService } from '../services/advance-ghrep.service';
import { CreateAdvanceGhrepDto } from '../dto/create-advance-ghrep.dto';
import { UpdateAdvanceGhrepDto } from '../dto/update-advance-ghrep.dto';
import { BulkCreateAdvanceGhrepItemDto } from '../dto/bulk-create-advance-ghrep.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import type { SignatureActor } from '../../representative-signatures/services/representative-signature.service';

@Controller('advance-ghrep')
export class AdvanceGhrepController {
  constructor(private readonly advanceGhrepService: AdvanceGhrepService) {}

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

  /** Main Details dropdown — Scheduled / Non-Scheduled Airlines OR Advance GH Rep. */
  @Get()
  @FrisPagePermissionAny(...GH_REP_LOOKUP_PAGE_PERMISSIONS)
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceGhrepService.findAll(filter, station);
  }

  @Get(':id')
  @FrisPagePermissionAny(...GH_REP_LOOKUP_PAGE_PERMISSIONS)
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceGhrepService.findOne(id, station);
  }

  @Post()
  @FrisPagePermission('advance', 'GH Representative')
  create(
    @Body() dto: CreateAdvanceGhrepDto,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceGhrepService.create(dto, station, this.buildActor(user, req));
  }

  @Post('bulk')
  @FrisPagePermission('advance', 'GH Representative')
  createBulk(
    @Body()
    body: BulkCreateAdvanceGhrepItemDto[] | { rows: BulkCreateAdvanceGhrepItemDto[] },
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: BulkCreateAdvanceGhrepItemDto[] }).rows ?? []);
    return this.advanceGhrepService.createBulk(
      rows,
      station,
      this.buildActor(user, req),
    );
  }

  @Patch(':id')
  @FrisPagePermission('advance', 'GH Representative')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceGhrepDto,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceGhrepService.update(
      id,
      dto,
      station,
      this.buildActor(user, req),
    );
  }

  @Delete(':id')
  @FrisPagePermission('advance', 'GH Representative')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceGhrepService.remove(id, station);
  }
}

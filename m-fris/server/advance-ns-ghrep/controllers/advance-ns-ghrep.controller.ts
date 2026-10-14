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
import { AdvanceNsGhrepService } from '../services/advance-ns-ghrep.service';
import { CreateAdvanceNsGhrepDto } from '../dto/create-advance-ns-ghrep.dto';
import { UpdateAdvanceNsGhrepDto } from '../dto/update-advance-ns-ghrep.dto';
import { BulkCreateAdvanceNsGhrepItemDto } from '../dto/bulk-create-advance-ns-ghrep.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import type { SignatureActor } from '../../representative-signatures/services/representative-signature.service';

@FrisPagePermission('advance', 'GH Representative')
@Controller('advance-ns-ghrep')
export class AdvanceNsGhrepController {
  constructor(private readonly advanceNsGhrepService: AdvanceNsGhrepService) {}

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

  @Post()
  create(
    @Body() dto: CreateAdvanceNsGhrepDto,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceNsGhrepService.create(
      dto,
      station,
      this.buildActor(user, req),
    );
  }

  @Post('bulk')
  createBulk(
    @Body()
    body:
      | BulkCreateAdvanceNsGhrepItemDto[]
      | { rows: BulkCreateAdvanceNsGhrepItemDto[] },
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    const rows = Array.isArray(body)
      ? body
      : ((body as { rows: BulkCreateAdvanceNsGhrepItemDto[] }).rows ?? []);
    return this.advanceNsGhrepService.createBulk(
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
    return this.advanceNsGhrepService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceNsGhrepService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvanceNsGhrepDto,
    @CurrentStation() station: StationScopeContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.advanceNsGhrepService.update(
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
    return this.advanceNsGhrepService.remove(id, station);
  }
}

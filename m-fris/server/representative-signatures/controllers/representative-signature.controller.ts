import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import { FLIGHT_FORM_PAGE_PERMISSIONS } from '../../auth/decorators/flight-form-page-permissions';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import {
  RepresentativeSignatureService,
  type SignatureActor,
} from '../services/representative-signature.service';
import { CreateRepresentativeSignatureDto } from '../dto/create-representative-signature.dto';
import { UpdateRepresentativeSignatureDto } from '../dto/update-representative-signature.dto';
import {
  REPRESENTATIVE_TYPES,
  type RepresentativeType,
} from '../schema/representative-signature.schema';

const bodyPipe = new ValidationPipe({ whitelist: true, transform: true });

@Controller('representative-signatures')
export class RepresentativeSignatureController {
  constructor(
    private readonly service: RepresentativeSignatureService,
  ) {}

  private buildActor(
    user: AuthenticatedPrincipal | undefined,
    req: { headers?: Record<string, unknown> },
  ): SignatureActor {
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

  private parseType(value: string | undefined): RepresentativeType {
    const t = String(value ?? '').trim().toUpperCase();
    if (!REPRESENTATIVE_TYPES.includes(t as RepresentativeType)) {
      throw new BadRequestException(
        `representativeType must be one of: ${REPRESENTATIVE_TYPES.join(', ')}`,
      );
    }
    return t as RepresentativeType;
  }

  /** Auto-fetch lookup: find an active signature by representative name + type. */
  @Get('lookup')
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  lookup(
    @Query('name') name: string,
    @Query('type') type: string,
  ) {
    return this.service.getSignatureByName(name, this.parseType(type));
  }

  /** Create a brand-new repository signature. */
  @Post()
  @FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
  create(
    @Body(bodyPipe) dto: CreateRepresentativeSignatureDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.service.createSignature(dto, this.buildActor(user, req));
  }

  // ---- Admin management ----

  @Get()
  @Roles(...ADMIN_ROLES)
  list(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.list({
      search,
      type: type ? this.parseType(type) : undefined,
      includeInactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @Roles(...ADMIN_ROLES)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/audit')
  @Roles(...ADMIN_ROLES)
  auditHistory(@Param('id') id: string) {
    return this.service.getAuditHistory(id);
  }

  @Put(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body(bodyPipe) dto: UpdateRepresentativeSignatureDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.service.updateSignature(id, dto, this.buildActor(user, req));
  }

  @Patch(':id/deactivate')
  @Roles(...ADMIN_ROLES)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Req() req: { headers?: Record<string, unknown> },
  ) {
    return this.service.deactivate(id, this.buildActor(user, req));
  }
}

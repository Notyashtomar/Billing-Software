import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { QueryAuditEventsDto, QueryAuditKpisDto } from '../dto/query-audit-events.dto';
import { AdminAuditService } from '../services/admin-audit.service';

const AUDIT_VIEWER_ROLES = [Role.SUPER_ADMIN, Role.MANAGER] as const;

@Controller('admin/audit')
@Roles(...AUDIT_VIEWER_ROLES)
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get('kpis')
  getKpis(@Query() query: QueryAuditKpisDto) {
    return this.adminAuditService.getKpis(query);
  }

  @Get('events')
  listEvents(@Query() query: QueryAuditEventsDto) {
    return this.adminAuditService.listEvents(query);
  }

  @Get('events/:eventId')
  getEvent(@Param('eventId') eventId: string) {
    return this.adminAuditService.getEventById(eventId);
  }

  @Get('events/:eventId/related')
  getRelated(
    @Param('eventId') eventId: string,
    @Query('scope') scope: 'user' | 'station' | 'module' = 'user',
  ) {
    return this.adminAuditService.getRelatedEvents(eventId, scope);
  }

  @Get('export')
  async exportEvents(
    @Query() query: QueryAuditEventsDto,
    @Query('format') format: 'csv' | 'xlsx' | 'pdf' = 'csv',
    @Res() res: Response,
  ) {
    const payload = await this.adminAuditService.exportEvents(query, format);
    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.send(payload.content);
  }
}

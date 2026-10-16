import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../auth/enums/roles.enum';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import {
  AddIncidentCommentDto,
  CreateIncidentDto,
  QueryIncidentsDto,
  UpdateIncidentDto,
} from '../dto/incident.dto';
import { AdminIncidentsService } from '../services/admin-incidents.service';

const INCIDENT_ROLES = [Role.SUPER_ADMIN, Role.MANAGER] as const;

@Controller('admin/incidents')
@Roles(...INCIDENT_ROLES)
export class AdminIncidentsController {
  constructor(private readonly incidentsService: AdminIncidentsService) {}

  @Get('kpis')
  getKpis(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.getKpis(query);
  }

  @Get('severity-summary')
  getSeveritySummary() {
    return this.incidentsService.getSeveritySummary();
  }

  @Get()
  list(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.listIncidents(query);
  }

  @Get('analytics')
  getAnalytics(@Query() query: QueryIncidentsDto) {
    return this.incidentsService.getAnalytics(query);
  }

  @Get('station-impact')
  getStationImpact() {
    return this.incidentsService.getStationImpact();
  }

  @Get('escalations')
  getEscalations() {
    return this.incidentsService.getEscalations();
  }

  @Get('alerts')
  getAlerts() {
    return this.incidentsService.getAlerts();
  }

  @Get('export')
  async export(
    @Query() query: QueryIncidentsDto,
    @Query('format') format: 'csv' | 'xlsx' | 'pdf' = 'csv',
    @Res() res: Response,
  ) {
    const payload = await this.incidentsService.exportIncidents(query, format);
    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.send(payload.content);
  }

  @Get(':incidentId')
  getOne(@Param('incidentId') incidentId: string) {
    return this.incidentsService.getIncident(incidentId);
  }

  @Post()
  create(
    @Body() body: CreateIncidentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.incidentsService.createIncident(body, user.name || user.userid);
  }

  @Patch(':incidentId')
  update(
    @Param('incidentId') incidentId: string,
    @Body() body: UpdateIncidentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.incidentsService.updateIncident(
      incidentId,
      body,
      user.name || user.userid,
    );
  }

  @Post(':incidentId/comments')
  addComment(
    @Param('incidentId') incidentId: string,
    @Body() body: AddIncidentCommentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.incidentsService.addComment(
      incidentId,
      body,
      user.name || user.userid,
    );
  }
}

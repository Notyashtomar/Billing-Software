/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import { SupportTicketService } from '../services/support-ticket.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  ADMIN_ROLES,
  FRIS_PANEL_ROLES,
  SUPER_ADMIN_PANEL_ROLES,
} from '../../auth/enums/roles.enum';
import { assertAdminPanelStationAccess } from '../../common/station/admin-panel-station-scope';
import { AdminPanelStationScopeService } from '../../common/station/admin-panel-station-scope.service';
import { CreatePanelUserDto } from '../dto/create-panel-user.dto';
import { UpdatePanelUserDto } from '../dto/update-panel-user.dto';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { CloseSupportTicketDto } from '../dto/close-support-ticket.dto';
import { ResolveSupportTicketDto } from '../dto/resolve-support-ticket.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';

const supportTicketPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private userService: UserService,
    private supportTicketService: SupportTicketService,
    private readonly adminPanelStationScope: AdminPanelStationScopeService,
  ) {}

  /** Raise Ticket dialog — any authenticated FRIS/admin user. */
  @Post('support-tickets')
  @UsePipes(supportTicketPipe)
  async createSupportTicket(
    @Body() body: CreateSupportTicketDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    this.logger.debug(
      `createSupportTicket userId=${String(user?.userId ?? '')} page=${body.navigationPagePath}`,
    );
    return this.supportTicketService.createTicket(user, body);
  }

  @Get('support-tickets/my')
  async listMySupportTickets(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.supportTicketService.listMyTickets(user);
  }

  @Get('support-tickets/admin-contacts')
  async listSupportTicketAdminContacts(
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supportTicketService.listAdminContacts(user);
  }

  /** Admin panel — list all raised tickets. */
  @Get('support-tickets/admin/list')
  @Roles(...ADMIN_ROLES)
  async listSupportTicketsForAdmin(
    @Query('status') statusParam: string | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const raw = String(statusParam ?? '').trim();
    const status =
      raw === 'open' || raw === 'closed' ? (raw as 'open' | 'closed') : undefined;
    return this.supportTicketService.listAllForAdmin(user, status);
  }

  @Get('support-tickets/admin/:ticketNumber')
  @Roles(...ADMIN_ROLES)
  async getSupportTicketForAdmin(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supportTicketService.getTicketForAdmin(user, ticketNumber);
  }

  @Patch('support-tickets/admin/:ticketNumber/resolve')
  @Roles(...ADMIN_ROLES)
  @UsePipes(supportTicketPipe)
  async resolveSupportTicketForAdmin(
    @Param('ticketNumber') ticketNumber: string,
    @Body() body: ResolveSupportTicketDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supportTicketService.resolveByAdmin(
      user,
      ticketNumber,
      body.resolutionNote,
    );
  }

  @Get('support-tickets/:ticketNumber')
  async trackSupportTicket(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supportTicketService.trackTicket(user, ticketNumber);
  }

  @Patch('support-tickets/:ticketNumber/close')
  @UsePipes(supportTicketPipe)
  async closeSupportTicket(
    @Param('ticketNumber') ticketNumber: string,
    @Body() body: CloseSupportTicketDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supportTicketService.closeTicket(
      user,
      ticketNumber,
      body.closeComment,
    );
  }

  @Get('station/:stationId/staff')
  @Roles(...ADMIN_ROLES)
  async listUsersByStation(
    @Param('stationId') stationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const scope = await this.adminPanelStationScope.resolve(user);
    assertAdminPanelStationAccess(scope, stationId);
    return this.userService.listPanelUsersByStation(stationId);
  }

  /**
   * Lightweight Mongo user directory for Hono/D1 modules (Log Data filters, grooming staff).
   * FRIS session users may list peers for their active station only — no passwords.
   */
  @Get('fris/directory')
  @Roles(...FRIS_PANEL_ROLES, ...ADMIN_ROLES)
  async listFrisDirectory(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('stationId') stationIdParam?: string,
  ) {
    const stationId =
      String(stationIdParam ?? '').trim() || String(user.stationId ?? '').trim();
    return this.userService.listFrisStationDirectory(user, stationId || undefined);
  }

  @Get()
  @Roles(...SUPER_ADMIN_PANEL_ROLES)
  async listUsers() {
    return this.userService.listPanelUsers();
  }

  /** User ID & Password page — station cards scoped to the signed-in admin. */
  @Get('panel/credentials-by-station')
  @Roles(...ADMIN_ROLES)
  async listCredentialsByStation(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.userService.listCredentialsByStation(user);
  }

  @Post('panel/:id/shoot-credentials')
  @Roles(...ADMIN_ROLES)
  async shootCredentials(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userService.shootCredentialsEmail(id, user);
  }

  @Get('panel/:id')
  @Roles(...SUPER_ADMIN_PANEL_ROLES)
  async getUser(@Param('id') id: string) {
    return this.userService.getPanelUserById(id);
  }

  /** Create employee user from admin panel (basic details + permissions). */
  @Post()
  @Roles(...SUPER_ADMIN_PANEL_ROLES)
  async createUser(
    @Body() body: CreatePanelUserDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    this.logger.debug(
      `createPanelUser userid=${String(body?.userid ?? '')} role=${String(body?.role ?? '')}`,
    );
    this.logger.debug(`Creator role: ${user.role}`);
    return this.userService.createPanelUser(body, user.role, {
      userId: user.userId,
      name: user.name,
      userid: user.userid,
      email: user.email,
      role: user.role,
      accountType: user.accountType,
    });
  }

  /** Update employee user from admin panel (basic details + permissions). */
  @Patch('panel/:id')
  @Roles(...SUPER_ADMIN_PANEL_ROLES)
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdatePanelUserDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    this.logger.debug(
      `updatePanelUser id=${id} role=${String(body?.role ?? '')}`,
    );
    this.logger.debug(`Updater role: ${user.role}`);
    return this.userService.updatePanelUser(id, body, user.role, {
      userId: user.userId,
      name: user.name,
      userid: user.userid,
      email: user.email,
      role: user.role,
      accountType: user.accountType,
    });
  }

  @Delete('panel/:id')
  @Roles(...SUPER_ADMIN_PANEL_ROLES)
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userService.deletePanelUser(id, {
      userId: user.userId,
      name: user.name,
      userid: user.userid,
      email: user.email,
      role: user.role,
      accountType: user.accountType,
    });
  }
}

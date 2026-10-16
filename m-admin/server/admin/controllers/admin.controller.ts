/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from '../services/admin.service';
import { SupportTicketService } from '../../user/services/support-ticket.service';
import { ResolveSupportTicketDto } from '../../user/dto/resolve-support-ticket.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { UpdateAdminDto } from '../dto/update-admin.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { extractAdminAuthCookieToken } from '../../auth/utils/auth-cookie.util';

const resolveTicketPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@Roles(...ADMIN_ROLES)
@Controller('admins')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private adminService: AdminService,
    private supportTicketService: SupportTicketService,
  ) {}

  @Get('panel')
  async listPanelAdmins() {
    return this.adminService.listPanelAdmins();
  }

  @Get('panel/:id')
  async getPanelAdmin(@Param('id') id: string) {
    return this.adminService.getPanelAdminById(id);
  }

  @Get('me')
  async getCurrentAdmin(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    if (!extractAdminAuthCookieToken(req)) {
      throw new UnauthorizedException('Admin panel sign-in required');
    }
    const adminId = String(user?.userId || '').trim();
    if (!adminId) throw new UnauthorizedException('Invalid token payload');
    const admin = await this.adminService.findById(adminId);
    if (!admin) throw new UnauthorizedException('Admin not found');
    const role = String(admin.role ?? '').trim().toLowerCase();
    if (role !== 'superadmin' && role !== 'manager' && role !== 'admin' && role !== 'operations') {
      throw new UnauthorizedException(
        'Only admin accounts may access the admin panel.',
      );
    }
    const canonicalRole = role === 'superadmin' ? 'superadmin' : 'manager';
    return {
      success: true,
      data: {
        id: String(admin._id),
        userid: admin.userid,
        name: admin.name,
        email: admin.email,
        role: canonicalRole,
        stationId: String((admin as { stationId?: string }).stationId ?? '').trim() || undefined,
        isGlobalAdmin: (admin as { isGlobalAdmin?: boolean }).isGlobalAdmin === true,
        adminPanelSections: Array.isArray(
          (admin as { adminPanelSections?: unknown[] }).adminPanelSections,
        )
          ? (admin as { adminPanelSections: unknown[] }).adminPanelSections.map(
              String,
            )
          : undefined,
      },
    };
  }

  /** GET /admins/support-tickets — all documents in Mongo `support_tickets`. */
  @Get('support-tickets')
  async listSupportTickets(
    @Query('status') statusParam: string | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const raw = String(statusParam ?? '').trim();
    const status =
      raw === 'open' || raw === 'closed' ? (raw as 'open' | 'closed') : undefined;
    this.logger.debug(`listSupportTickets status=${status ?? 'all'}`);
    return this.supportTicketService.listAllForAdmin(user, status);
  }

  @Get('support-tickets/:ticketNumber')
  async getSupportTicket(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.supportTicketService.getTicketForAdmin(user, ticketNumber);
  }

  @Patch('support-tickets/:ticketNumber/resolve')
  @UsePipes(resolveTicketPipe)
  async resolveSupportTicket(
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

  @Patch('panel/:id')
  async updatePanelAdmin(
    @Param('id') id: string,
    @Body() body: UpdateAdminDto,
  ) {
    this.logger.debug(`updatePanelAdmin id=${id}`);
    return this.adminService.updatePanelAdmin(id, body);
  }

  @Delete('panel/:id')
  async deletePanelAdmin(@Param('id') id: string) {
    return this.adminService.deletePanelAdmin(id);
  }
}

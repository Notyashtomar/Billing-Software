import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { Role } from '../../../auth/enums/roles.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../../auth/services/identity.service';
import {
  ApproveRegisteredUserDto,
  BulkCreateUserInvitesDto,
  CreateUserInviteDto,
  RejectRegisteredUserDto,
  RemoveUserInviteDto,
  ResendUserInviteDto,
} from '../dto/user-registration.dto';
import { UserRegistrationService } from '../services/user-registration.service';
import { FileStorageService } from '../../../common/storage/file-storage.service';

const registrationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@Controller()
export class UserRegistrationController {
  constructor(
    private readonly userRegistrationService: UserRegistrationService,
    private readonly fileStorage: FileStorageService,
  ) {}

  private async sendDocumentFile(
    res: Response,
    file: { filePath: string; mimeType: string; originalName: string },
  ) {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.originalName.replace(/"/g, '')}"`,
    );
    const absolute = this.fileStorage.resolveSendFilePath(file.filePath);
    if (absolute) {
      return res.sendFile(absolute);
    }
    const stored = await this.fileStorage.read(file.filePath);
    return res.send(stored.buffer);
  }

  @Post('invite-user')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  @UsePipes(registrationPipe)
  createInvite(
    @Body() body: CreateUserInviteDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userRegistrationService.createInvite(body, {
      userId: String(user.userId ?? ''),
      name: user.name,
      email: user.email,
    });
  }

  @Post('bulk-invite-users')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  @UsePipes(registrationPipe)
  createInvitesBulk(
    @Body() body: BulkCreateUserInvitesDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userRegistrationService.createInvitesBulk(body, {
      userId: String(user.userId ?? ''),
      name: user.name,
      email: user.email,
    });
  }

  @Post('resend-invite')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  @UsePipes(registrationPipe)
  resendInvite(
    @Body() body: ResendUserInviteDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userRegistrationService.resendInvite(body, {
      name: user.name,
      email: user.email,
    });
  }

  @Post('remove-invite')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  @UsePipes(registrationPipe)
  removeInvite(
    @Body() body: RemoveUserInviteDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userRegistrationService.removeInvite(body, {
      name: user.name,
      email: user.email,
    });
  }

  @Get('user-registration-workspace')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  getWorkspace(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.userRegistrationService.getWorkspace(user);
  }

  @Get('export/user-activity-log')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  exportUserActivityLog() {
    return this.userRegistrationService.listExportUserActivityLog();
  }

  @Post('approve-user')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  @UsePipes(registrationPipe)
  approveUser(
    @Body() body: ApproveRegisteredUserDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userRegistrationService.approveUser(body, {
      name: user.name,
      email: user.email,
    });
  }

  @Post('reject-user')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  @UsePipes(registrationPipe)
  rejectUser(
    @Body() body: RejectRegisteredUserDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.userRegistrationService.rejectUser(body, {
      name: user.name,
      email: user.email,
    });
  }

  @Get('verify-invite/:token')
  @Public()
  verifyInvite(
    @Param('token') token: string,
    @Query('id') inviteId?: string,
  ) {
    return this.userRegistrationService.verifyInvite(token, inviteId);
  }

  @Post('register-user')
  @Public()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 25 },
    }),
  )
  registerUser(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.userRegistrationService.registerUser(payload, files ?? []);
  }

  /** Admin-only: view registration KYC documents during approval workflow. */
  @Get('user-registration/documents/:documentId/file')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  async getDocumentFileAdmin(
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const file = await this.userRegistrationService.getDocumentFile(documentId);
    return this.sendDocumentFile(res, file);
  }

  /** Invite registration: requires matching invite token (no anonymous IDOR). */
  @Get('register-invite/documents/:documentId/file')
  @Public()
  async getDocumentFileForInvite(
    @Param('documentId') documentId: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    if (!token?.trim()) {
      throw new ForbiddenException('Invite token is required');
    }
    const file = await this.userRegistrationService.getDocumentFileForInvite(
      documentId,
      token.trim(),
    );
    return this.sendDocumentFile(res, file);
  }
}

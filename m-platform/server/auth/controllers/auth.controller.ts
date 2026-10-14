/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottleCategoryDecorator } from '../../protection/decorators/throttle-category.decorator';
import { AuthService } from '../services/auth.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedPrincipal } from '../services/identity.service';
import { Roles } from '../decorators/roles.decorator';
import { ADMIN_ROLES, FRIS_PANEL_ROLES, Role } from '../enums/roles.enum';
import {
  clearAdminAuthCookie,
  clearAllAuthCookies,
  clearFrisAuthCookie,
  setAdminLoginCookie,
  setFrisLoginCookie,
} from '../utils/clear-auth-cookies.util';
import {
  SendPasswordResetOtpDto,
  VerifyPasswordResetOtpDto,
  VerifyPasswordResetOtpOnlyDto,
} from '../dto/password-reset-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('login')
  async login(
    @Body('userid') userid: string,
    @Body('password') password: string,
    @Body('stationId') stationId: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isSafetyClient =
      String(req.headers['x-auth-client'] ?? '')
        .trim()
        .toLowerCase() === 'safety-incident';
    const result = await this.authService.login(userid, password, {
      ip: req.ip,
      requestId: String(req.headers['x-request-id'] ?? ''),
      stationId,
      // Safety: only auto-pick when client did not send a map/station selection.
      autoSelectFirstStation: isSafetyClient && !String(stationId ?? '').trim(),
    });
    setFrisLoginCookie(res, String(result.access_token ?? ''));

    const { access_token: _accessToken, ...responseBody } = result;
    // Safety Hono verifies credentials server-side and needs JWT to proxy FRIS
    // flight lookups — never set as a browser cookie for that client.
    if (isSafetyClient && result.access_token) {
      return { ...responseBody, access_token: result.access_token };
    }
    return responseBody;
  }

  /** Admin panel login — sets a dedicated cookie so FRIS employee login cannot replace it. */
  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('admin-login')
  async adminLogin(
    @Body('userid') userid: string,
    @Body('password') password: string,
    @Body('totpCode') totpCode: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginAdminPanel(userid, password, {
      ip: req.ip,
      requestId: String(req.headers['x-request-id'] ?? ''),
      totpCode,
    });
    const role = String(
      (result.user as { role?: string } | undefined)?.role ?? '',
    )
      .trim()
      .toLowerCase();
    if (
      result.collection !== 'admin' ||
      (role !== 'superadmin' && role !== 'manager' && role !== 'admin' && role !== 'operations')
    ) {
      throw new UnauthorizedException(
        'Only admin accounts may sign in to the admin panel.',
      );
    }

    setAdminLoginCookie(res, String(result.access_token ?? ''));

    const { access_token: _accessToken, ...responseBody } = result;
    return responseBody;
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.authService.recordLogoutActivity(req, 'fris');
    clearFrisAuthCookie(res);
    return {
      success: true,
      message: 'Logout successful',
    };
  }

  @Public()
  @Post('admin-logout')
  adminLogout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.authService.recordLogoutActivity(req, 'admin');
    clearAdminAuthCookie(res);
    return {
      success: true,
      message: 'Admin logout successful',
    };
  }

  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user);
    clearAllAuthCookies(res);
    return result;
  }

  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  /** Login-card forgot password: send OTP to registered email. */
  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('forgot-password/send-otp')
  sendPasswordResetOtp(@Body() body: SendPasswordResetOtpDto) {
    return this.authService.sendPasswordResetOtp(body);
  }

  /** Login-card forgot password: verify OTP before new-password fields. */
  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('forgot-password/verify-otp')
  verifyPasswordResetOtpOnly(@Body() body: VerifyPasswordResetOtpOnlyDto) {
    return this.authService.verifyPasswordResetOtpOnly(body);
  }

  /** Login-card forgot password: save new password after OTP verified. */
  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('forgot-password/verify-reset')
  verifyPasswordResetOtp(@Body() body: VerifyPasswordResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(body);
  }

  @Public()
  @ThrottleCategoryDecorator('AUTH')
  @Post('reset-password')
  resetPassword(@Body() body: { token?: string; newPassword?: string }) {
    return this.authService.resetPassword(
      String(body?.token ?? '').trim(),
      String(body?.newPassword ?? ''),
    );
  }

  @Get('session')
  getSession(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.getSession(user);
  }

  /**
   * Browser page beacon — records which UI route the user is currently on.
   * Throttled server-side when the path is unchanged.
   */
  @Post('page-presence')
  @Roles(...FRIS_PANEL_ROLES, ...ADMIN_ROLES)
  pagePresence(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body('path') path: string,
  ) {
    return this.authService.recordPagePresence(user, path);
  }

  /** Re-check login password for destructive actions (session must already be valid). */
  @Post('confirm-password')
  @Roles(...FRIS_PANEL_ROLES, ...ADMIN_ROLES)
  confirmPassword(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body('password') password: string,
  ) {
    return this.authService.confirmPassword(user, password);
  }

  /** Superadmin: rebind the FRIS/Billing session to another station. */
  @Roles(Role.SUPER_ADMIN)
  @Post('switch-station')
  async switchStation(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body('stationCode') stationCode: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.switchFrisStation(user, stationCode);
    setFrisLoginCookie(res, String(result.access_token ?? ''));
    const { access_token: _accessToken, ...body } = result;
    return body;
  }

  /** FRIS session check — validates the FRIS httpOnly cookie only (not admin panel). */
  @Public()
  @Get('fris-session')
  getFrisSession(@Req() req: Request) {
    return this.authService.getFrisSessionFromRequest(req);
  }

  /** Validates FRIS Advance tab access and returns the client redirect path. */
  @Get('fris/navigate/advance')
  navigateAdvanceTab(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('tab') tab: string,
  ) {
    return this.authService.resolveFrisAdvanceNavigation(user, tab);
  }

  /** Validates FRIS Creation section access and returns the client redirect path. */
  @Get('fris/navigate/creation')
  navigateCreationSection(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('section') section: string,
  ) {
    return this.authService.resolveFrisCreationNavigation(user, section);
  }

  @Roles(...FRIS_PANEL_ROLES, ...ADMIN_ROLES)
  @Post('send-otp')
  sendOtp(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body('flightId') flightId: string,
    @Body('purpose')
    purpose:
      | 'cancel-step-1'
      | 'cancel-step-2'
      | 'reopen-step-1'
      | 'reopen-step-2',
    @Body('flightKind') flightKind?: string,
  ) {
    return this.authService.sendCancelFlightOtp(
      user.userId,
      user.role,
      user.accountType,
      String(flightId || '').trim(),
      purpose,
      String(flightKind ?? '').trim().toLowerCase() === 'non-scheduled'
        ? 'non-scheduled'
        : 'scheduled',
    );
  }

  @Roles(...FRIS_PANEL_ROLES, ...ADMIN_ROLES)
  @Post('verify-otp')
  verifyOtp(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body()
    body: {
      flightId?: string;
      purpose?:
        | 'cancel-step-1'
        | 'cancel-step-2'
        | 'reopen-step-1'
        | 'reopen-step-2';
      otp?: string;
      cancellationForm?: Record<string, unknown>;
      flightSnapshot?: Record<string, unknown>;
      flightKind?: string;
    },
  ) {
    return this.authService.verifyCancelFlightOtp(
      user.userId,
      user.role,
      user.accountType,
      String(body?.flightId || '').trim(),
      body?.purpose ?? 'cancel-step-1',
      String(body?.otp || '').trim(),
      body?.cancellationForm,
      body?.flightSnapshot,
      user.stationCode,
      String(body?.flightKind ?? '').trim().toLowerCase() === 'non-scheduled'
        ? 'non-scheduled'
        : 'scheduled',
    );
  }
}

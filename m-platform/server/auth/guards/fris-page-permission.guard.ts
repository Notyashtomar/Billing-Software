import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FRIS_PAGE_PERMISSION_ANY_KEY,
  FRIS_PAGE_PERMISSION_KEY,
  type FrisPagePermissionMeta,
} from '../decorators/fris-page-permission.decorator';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';
import { isBillingPortalUserid } from 'src/user/utils/billing-portal-users.util';
import { AuthService } from '../services/auth.service';

@Injectable()
export class FrisPagePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { userid?: string };
      originalUrl?: string;
      url?: string;
    }>();
    const path = String(request.originalUrl ?? request.url ?? '');
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      !isPublic &&
      path.includes('/billing') &&
      !path.includes('/billing/kyc/invite') &&
      !isBillingPortalUserid(request.user?.userid)
    ) {
      throw new ForbiddenException('User not Allowed to login');
    }

    const anyPages = this.reflector.getAllAndOverride<
      FrisPagePermissionMeta[] | undefined
    >(FRIS_PAGE_PERMISSION_ANY_KEY, [context.getHandler(), context.getClass()]);

    const { user } = context.switchToHttp().getRequest();

    if (anyPages && anyPages.length > 0) {
      for (const page of anyPages) {
        if (
          await this.authService.hasFrisPageAccess(
            user,
            page.tab,
            page.pageLabel,
          )
        ) {
          return true;
        }
      }
      const labels = anyPages.map((p) => p.pageLabel).join(', ');
      throw new ForbiddenException(
        `You do not have permission to access any of: ${labels}`,
      );
    }

    const meta = this.reflector.getAllAndOverride<
      FrisPagePermissionMeta | undefined
    >(FRIS_PAGE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!meta) return true;

    await this.authService.assertFrisPageAccess(
      user,
      meta.tab,
      meta.pageLabel,
    );
    return true;
  }
}

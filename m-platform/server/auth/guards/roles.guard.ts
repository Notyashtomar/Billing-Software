/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/roles.enum';
import { canonicalizeRole, normalizeAdminRole } from '../services/identity.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role && user?.accountType !== 'admin') {
      throw new UnauthorizedException('Authentication is required');
    }

    const userRole = canonicalizeRole(user.role);
    const normalizedRequired = requiredRoles.map((role) => canonicalizeRole(role));

    if (normalizedRequired.includes(userRole)) {
      return true;
    }

    const requiresSuperAdmin = normalizedRequired.includes(Role.SUPER_ADMIN);
    if (requiresSuperAdmin && user.accountType === 'admin') {
      const adminRole = normalizeAdminRole(userRole);
      if (adminRole === Role.SUPER_ADMIN) {
        return true;
      }
    }

    throw new ForbiddenException(
      'You do not have permission to perform this action',
    );
  }
}

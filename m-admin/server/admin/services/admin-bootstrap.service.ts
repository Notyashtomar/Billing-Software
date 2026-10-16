import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  private getEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`❌ Missing environment variable: ${key}`);
    }
    return value;
  }

  async onModuleInit() {
    const email = this.getEnv('SUPERADMIN_EMAIL');
    const name = this.getEnv('SUPERADMIN_NAME');
    const username = this.getEnv('SUPERADMIN_USERNAME');
    const password = this.getEnv('SUPERADMIN_PASSWORD');
    const role = this.getEnv('SUPERADMIN_ROLE');

    // Seed directly (bypassing the interactive password policy + permission
    // guard): the super admin always gets full access. Idempotent — only creates
    // when missing, so a deleted super admin is restored on the next boot.
    const created = await this.adminService.ensureSuperAdminSeed({
      name,
      userid: username,
      email,
      password,
      role,
    });

    this.logger.log(
      created
        ? 'Super Admin created in admin collection (full access)'
        : 'Super Admin already exists in admin collection',
    );

    // Visibility for admins is driven by the explicit `isGlobalAdmin` flag, not
    // by role. The designated super admin must be global so it can see/operate
    // on every station; otherwise it fails closed (no station assigned).
    const isGlobal =
      String(this.configService.get<string>('SUPERADMIN_IS_GLOBAL') ?? 'true')
        .trim()
        .toLowerCase() !== 'false';
    const changed = await this.adminService.ensureGlobalSuperAdmin(
      email,
      isGlobal,
    );
    if (changed) {
      this.logger.log(
        `Super Admin isGlobalAdmin set to ${isGlobal} (existing sessions invalidated; re-login required)`,
      );
    }
  }
}

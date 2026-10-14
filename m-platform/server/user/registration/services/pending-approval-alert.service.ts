import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AdminService } from '../../../admin/services/admin.service';
import { lazyService } from '../../../common/nestjs/lazy-service.util';
import { User, type UserDocument } from '../../schema/user.schema';
import { UserInviteMailerService } from './user-invite-mailer.service';
import {
  PENDING_APPROVAL_STALE_MS,
  isPendingApprovalRecord,
  resolvePendingSubmittedAt,
  shouldAlertStalePending,
} from './pending-approval-alert.util';

function envEnabled(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

@Injectable()
export class PendingApprovalAlertService implements OnModuleInit {
  private readonly logger = new Logger(PendingApprovalAlertService.name);
  private readonly cronEnabled = envEnabled(
    'PENDING_APPROVAL_ALERT_ENABLED',
    true,
  );
  private running = false;
  private readonly scheduledUserTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailer: UserInviteMailerService,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../../admin/services/admin.service')
              .AdminService as typeof import('../../../admin/services/admin.service').AdminService,
        ),
      ),
    )
    private readonly adminService: AdminService,
  ) {
    this.logger.log(
      `[pending_approval_alert] automatic sweep=${this.cronEnabled ? 'on' : 'off'}`,
    );
  }

  onModuleInit(): void {
    if (!this.cronEnabled) return;
    const boot = setTimeout(() => this.runAutomaticSweep('startup'), 15_000);
    boot.unref?.();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  scheduledSweep(): void {
    this.runAutomaticSweep('cron');
  }

  /** Fire a one-shot check 24h after a registration is submitted. */
  scheduleAlertForUser(userId: string, submittedAt = new Date()): void {
    if (!this.cronEnabled) return;
    const id = String(userId ?? '').trim();
    if (!id) return;
    const existing = this.scheduledUserTimers.get(id);
    if (existing) clearTimeout(existing);
    const delay = Math.max(
      1_000,
      PENDING_APPROVAL_STALE_MS - (Date.now() - submittedAt.getTime()),
    );
    const timer = setTimeout(() => {
      this.scheduledUserTimers.delete(id);
      this.runAutomaticSweep('submit-timer');
    }, delay);
    timer.unref?.();
    this.scheduledUserTimers.set(id, timer);
  }

  private runAutomaticSweep(reason: 'startup' | 'cron' | 'submit-timer'): void {
    if (!this.cronEnabled) return;
    void this.notifyStalePendingApprovals().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[pending_approval_alert] ${reason} sweep failed: ${message}`,
      );
    });
  }

  async notifyStalePendingApprovals(now = new Date()): Promise<{
    staleCount: number;
    emailed: number;
  }> {
    if (this.running) {
      return { staleCount: 0, emailed: 0 };
    }
    this.running = true;
    try {
      const pending = await this.userModel
        .find({
          $or: [
            { approvalStatus: 'pending' },
            { accountStatus: 'pending' },
            { registrationStatus: 'pending' },
          ],
          approvalStatus: { $ne: 'rejected' },
          accountStatus: { $nin: ['rejected', 'invited'] },
        })
        .select(
          'name email userid employeeId station departmentLabel approvalStatus accountStatus registrationStatus inviteStatus registrationActivity lastActivityAt createdAt updatedAt staleApprovalAlertSentAt',
        )
        .lean()
        .exec();

      const stale = pending
        .filter((user) => isPendingApprovalRecord(user))
        .map((user) => {
          const submittedAt = resolvePendingSubmittedAt(user);
          const alertSentAt = user.staleApprovalAlertSentAt
            ? new Date(user.staleApprovalAlertSentAt)
            : undefined;
          return {
            id: String(user._id),
            name: String(user.name ?? '').trim() || 'Unnamed applicant',
            employeeId: String(user.employeeId ?? user.userid ?? '').trim(),
            email: String(user.email ?? '').trim(),
            station: String(user.station ?? '').trim(),
            submittedAt,
            waitingHours: Math.max(
              24,
              Math.floor((now.getTime() - submittedAt.getTime()) / 3_600_000),
            ),
            shouldAlert: shouldAlertStalePending(submittedAt, alertSentAt, now),
          };
        })
        .filter((row) => row.shouldAlert)
        .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

      if (stale.length === 0) {
        return { staleCount: 0, emailed: 0 };
      }

      const recipients = await this.listSuperadminEmails();
      if (recipients.length === 0) {
        this.logger.warn(
          `[pending_approval_alert] ${stale.length} stale approval(s) but no superadmin email found`,
        );
        return { staleCount: stale.length, emailed: 0 };
      }

      const reviewUrl = `${this.getFrontendBaseUrl()}/admin/onboarding`;
      const approvals = stale.map((row) => ({
        name: row.name,
        employeeId: row.employeeId,
        email: row.email,
        station: row.station,
        waitingHours: row.waitingHours,
      }));

      let emailed = 0;
      for (const to of recipients) {
        const result = await this.mailer.sendStalePendingApprovalsEmail({
          to,
          approvals,
          reviewUrl,
        });
        if (result.sent) emailed += 1;
        else {
          this.logger.warn(
            `[pending_approval_alert] send failed for ${to}: ${result.error}`,
          );
        }
      }

      if (emailed > 0) {
        await this.userModel.updateMany(
          { _id: { $in: stale.map((row) => row.id) } },
          { $set: { staleApprovalAlertSentAt: now } },
        );
      }

      this.logger.log(
        `[pending_approval_alert] stale=${stale.length} recipients=${recipients.length} emailed=${emailed}`,
      );
      return { staleCount: stale.length, emailed };
    } finally {
      this.running = false;
    }
  }

  private async listSuperadminEmails(): Promise<string[]> {
    const emails = new Set<string>(
      await this.adminService.listActiveSuperadminEmails(),
    );

    const users = await this.userModel
      .find({
        $or: [{ authorizationRole: 'superadmin' }, { role: 'superadmin' }],
      })
      .select('email companyEmail accountStatus isActive')
      .lean()
      .exec();

    for (const user of users) {
      if (user.isActive === false) continue;
      const status = String(user.accountStatus ?? 'active').trim().toLowerCase();
      if (status && status !== 'active') continue;
      for (const raw of [user.email, user.companyEmail]) {
        const email = String(raw ?? '').trim().toLowerCase();
        if (email.includes('@')) emails.add(email);
      }
    }

    return [...emails];
  }

  private getFrontendBaseUrl(): string {
    return (
      process.env.FRONTEND_URL ||
      process.env.CLIENT_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://fris.bird-in.workers.dev'
    ).replace(/\/$/, '');
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminEmail,
  type AdminEmailDocument,
} from '../../../auth/schema/admin-email.schema';
import {
  isConnectionTimeoutError,
  isValidEmail,
  normalizeAppPassword,
  railwaySmtpHint,
  sendViaGmail,
  sendViaResendApi,
  type MailPayload,
} from '../../../common/mail/mail-transport.util';

type SenderCredentials = { email: string; appPassword: string };

export type InviteEmailResult = {
  sent: boolean;
  error?: string;
};

@Injectable()
export class UserInviteMailerService {
  private readonly logger = new Logger(UserInviteMailerService.name);

  constructor(
    @InjectModel(AdminEmail.name)
    private readonly adminEmailModel: Model<AdminEmailDocument>,
  ) {}

  private async getSenderCandidates(): Promise<SenderCredentials[]> {
    const candidates: SenderCredentials[] = [];
    const seen = new Set<string>();

    const pushCandidate = (email: string, appPassword: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPass = normalizeAppPassword(appPassword);
      if (!isValidEmail(normalizedEmail) || !normalizedPass) return;
      const key = `${normalizedEmail}::${normalizedPass}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ email: normalizedEmail, appPassword: normalizedPass });
    };

    const envEmail = String(process.env.EMAIL_USER || '').trim().toLowerCase();
    pushCandidate(envEmail, process.env.EMAIL_PASS || '');

    const activeSenders = await this.adminEmailModel
      .find({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    for (const sender of activeSenders) {
      pushCandidate(String(sender.email ?? ''), String(sender.appPassword ?? ''));
    }

    return candidates;
  }

  private getCompanyName(company?: string): string {
    return company?.trim() || 'FRIS';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async trySendWithSender(
    sender: SenderCredentials,
    mail: MailPayload,
  ): Promise<void> {
    await sendViaGmail(sender.email, sender.appPassword, mail);
  }

  async sendWelcomeInviteEmail(input: {
    to: string;
    inviteUrl: string;
    company?: string;
    invitedRole?: string;
    expiresAt: Date;
  }): Promise<InviteEmailResult> {
    const senders = await this.getSenderCandidates();
    const hasResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());

    if (senders.length === 0 && !hasResend) {
      this.logger.warn(
        'No sender email configured — invite link created but email not sent.',
      );
      return {
        sent: false,
        error:
          'Email is not configured. Set EMAIL_USER/EMAIL_PASS, RESEND_API_KEY, or add an active admin email.',
      };
    }

    const companyName = this.getCompanyName(input.company);
    const roleLabel = input.invitedRole?.trim() || 'employee';
    const expiryLabel = input.expiresAt.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const subject = `Welcome to ${companyName} — complete your employee registration`;
    const text = [
      `Welcome to ${companyName}!`,
      '',
      'You have been invited to join our team. Please complete your employee onboarding form using the secure link below:',
      input.inviteUrl,
      '',
      `Role: ${roleLabel}`,
      `This link expires on ${expiryLabel}.`,
      '',
      'The form will ask for your basic details, contact information, login credentials, and required documents.',
      '',
      `If you did not expect this email, please ignore it or contact your ${companyName} administrator.`,
    ].join('\n');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#059669,#0891b2);border-radius:16px;padding:24px;color:#fff;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;opacity:0.9;">${companyName}</p>
          <h1 style="margin:0;font-size:28px;">Welcome aboard!</h1>
        </div>
        <p style="font-size:16px;">You have been invited to join <strong>${companyName}</strong> as an <strong>${roleLabel}</strong>.</p>
        <p style="font-size:15px;">Please complete your employee registration form using the secure link below. You will be able to fill in your basic details, set up login credentials, and upload required documents.</p>
        <p style="margin:28px 0;">
          <a href="${input.inviteUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600;">
            Complete registration form
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;word-break:break-all;">Or copy this link: ${input.inviteUrl}</p>
        <p style="font-size:13px;color:#64748b;">This invite expires on <strong>${expiryLabel}</strong>.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:12px;color:#94a3b8;">If you did not expect this email, you can safely ignore it.</p>
      </div>
    `;

    const primarySender = senders[0];
    const mail: MailPayload = {
      from: `"${companyName}" <${primarySender?.email || process.env.EMAIL_USER || 'noreply@fris.app'}>`,
      replyTo: primarySender?.email,
      to: input.to,
      subject,
      text,
      html,
    };

    let lastError: unknown;
    let sawConnectionTimeout = false;

    for (const sender of senders) {
      try {
        await this.trySendWithSender(sender, {
          ...mail,
          from: `"${companyName}" <${sender.email}>`,
          replyTo: sender.email,
        });
        this.logger.log(
          `[INVITE MAIL] Sent invite email to ${input.to} via ${sender.email}`,
        );
        return { sent: true };
      } catch (error) {
        lastError = error;
        if (isConnectionTimeoutError(error)) {
          sawConnectionTimeout = true;
        }
        this.logger.error(
          `[INVITE MAIL] Sender failed: ${sender.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (hasResend || sawConnectionTimeout) {
      const resendResult = await sendViaResendApi(mail);
      if (resendResult.ok) {
        this.logger.log(
          `[INVITE MAIL] Sent invite email to ${input.to} via Resend API`,
        );
        return { sent: true };
      }
      if (!lastError) {
        lastError = new Error(resendResult.error);
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === 'string'
          ? lastError
          : 'SMTP send failed';

    const suffix = sawConnectionTimeout ? ` ${railwaySmtpHint()}` : '';

    return {
      sent: false,
      error: `Could not send invite email (${message}).${suffix} Share the invite link manually.`,
    };
  }

  async sendFrisAccessCredentialsEmail(input: {
    to: string;
    employeeName?: string;
    employeeId: string;
    password: string;
    company?: string;
    loginUrl: string;
  }): Promise<InviteEmailResult> {
    const senders = await this.getSenderCandidates();
    const hasResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());

    if (senders.length === 0 && !hasResend) {
      this.logger.warn(
        'No sender email configured — credentials email not sent.',
      );
      return {
        sent: false,
        error:
          'Email is not configured. Set EMAIL_USER/EMAIL_PASS, RESEND_API_KEY, or add an active admin email.',
      };
    }

    const companyName = this.getCompanyName(input.company);
    const employeeNameRaw = input.employeeName?.trim() || 'there';
    const employeeIdRaw = input.employeeId.trim();
    const passwordRaw = input.password;
    const loginUrlRaw = input.loginUrl.trim();
    const employeeNameHtml = this.escapeHtml(employeeNameRaw);
    const employeeIdHtml = this.escapeHtml(employeeIdRaw);
    const passwordHtml = this.escapeHtml(passwordRaw);
    const loginUrlHtml = this.escapeHtml(loginUrlRaw);

    const subject = `Your ${companyName} FRIS login credentials`;
    const text = [
      `Hello ${employeeNameRaw},`,
      '',
      `Your employee registration for ${companyName} has been approved.`,
      '',
      'Use the credentials below to sign in to FRIS:',
      `User ID: ${employeeIdRaw}`,
      `Password: ${passwordRaw}`,
      '',
      `Sign in here: ${loginUrlRaw}`,
      '',
      'On the landing page, select your station on the map, then enter your User ID and password.',
      '',
      'Keep this password private. If you did not expect this email, contact your administrator.',
    ].join('\n');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#059669,#0891b2);border-radius:16px;padding:24px;color:#fff;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;opacity:0.9;">${companyName}</p>
          <h1 style="margin:0;font-size:28px;">Your FRIS access is ready</h1>
        </div>
        <p style="font-size:16px;">Hello <strong>${employeeNameHtml}</strong>,</p>
        <p style="font-size:15px;">Your employee registration has been approved. Use the credentials below to sign in to FRIS.</p>
        <div style="margin:24px 0;padding:20px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Login credentials</p>
          <p style="margin:0 0 8px;font-size:15px;"><strong>User ID:</strong> <span style="font-family:Consolas,Monaco,monospace;">${employeeIdHtml}</span></p>
          <p style="margin:0;font-size:15px;"><strong>Password:</strong> <span style="font-family:Consolas,Monaco,monospace;">${passwordHtml}</span></p>
        </div>
        <p style="margin:28px 0;">
          <a href="${loginUrlRaw}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600;">
            Open FRIS sign-in
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;">Select your station on the map, then sign in with the User ID and password above.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:12px;color:#94a3b8;">Keep this password private. If you did not expect this email, contact your ${companyName} administrator.</p>
      </div>
    `;

    const primarySender = senders[0];
    const mail: MailPayload = {
      from: `"${companyName}" <${primarySender?.email || process.env.EMAIL_USER || 'noreply@fris.app'}>`,
      replyTo: primarySender?.email,
      to: input.to,
      subject,
      text,
      html,
    };

    let lastError: unknown;
    let sawConnectionTimeout = false;

    for (const sender of senders) {
      try {
        await this.trySendWithSender(sender, {
          ...mail,
          from: `"${companyName}" <${sender.email}>`,
          replyTo: sender.email,
        });
        this.logger.log(
          `[CREDENTIALS MAIL] Sent FRIS credentials to ${input.to} via ${sender.email}`,
        );
        return { sent: true };
      } catch (error) {
        lastError = error;
        if (isConnectionTimeoutError(error)) {
          sawConnectionTimeout = true;
        }
        this.logger.error(
          `[CREDENTIALS MAIL] Sender failed: ${sender.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (hasResend || sawConnectionTimeout) {
      const resendResult = await sendViaResendApi(mail);
      if (resendResult.ok) {
        this.logger.log(
          `[CREDENTIALS MAIL] Sent FRIS credentials to ${input.to} via Resend API`,
        );
        return { sent: true };
      }
      if (!lastError) {
        lastError = new Error(resendResult.error);
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === 'string'
          ? lastError
          : 'SMTP send failed';

    const suffix = sawConnectionTimeout ? ` ${railwaySmtpHint()}` : '';

    return {
      sent: false,
      error: `Could not send credentials email (${message}).${suffix}`,
    };
  }

  /**
   * Send a User ID reminder email (no password included).
   * Used by the Shoot button on the User ID & Password page.
   * The password is NOT included because it is stored as a bcrypt hash and
   * cannot be recovered. The user is told to use their existing password.
   */
  async sendUserIdReminderEmail(input: {
    to: string;
    employeeName?: string;
    employeeId: string;
    company?: string;
    loginUrl: string;
  }): Promise<InviteEmailResult> {
    const senders = await this.getSenderCandidates();
    const hasResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());

    if (senders.length === 0 && !hasResend) {
      this.logger.warn(
        'No sender email configured — user ID reminder email not sent.',
      );
      return {
        sent: false,
        error:
          'Email is not configured. Set EMAIL_USER/EMAIL_PASS, RESEND_API_KEY, or add an active admin email.',
      };
    }

    const companyName = this.getCompanyName(input.company);
    const employeeNameRaw = input.employeeName?.trim() || 'there';
    const employeeIdRaw = input.employeeId.trim();
    const loginUrlRaw = input.loginUrl.trim();
    const employeeNameHtml = this.escapeHtml(employeeNameRaw);
    const employeeIdHtml = this.escapeHtml(employeeIdRaw);
    const loginUrlHtml = this.escapeHtml(loginUrlRaw);

    const subject = `Your ${companyName} FRIS User ID reminder`;
    const text = [
      `Hello ${employeeNameRaw},`,
      '',
      `This is a reminder of your FRIS login credentials for ${companyName}.`,
      '',
      `User ID: ${employeeIdRaw}`,
      'Password: Use the password you were given at registration or your most recently updated password.',
      '',
      `Sign in here: ${loginUrlRaw}`,
      '',
      'On the landing page, select your station on the map, then enter your User ID and password.',
      '',
      'If you have forgotten your password, please contact your administrator to reset it.',
    ].join('\n');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#059669,#0891b2);border-radius:16px;padding:24px;color:#fff;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;opacity:0.9;">${companyName}</p>
          <h1 style="margin:0;font-size:28px;">Your FRIS User ID reminder</h1>
        </div>
        <p style="font-size:16px;">Hello <strong>${employeeNameHtml}</strong>,</p>
        <p style="font-size:15px;">This is a reminder of your FRIS login credentials.</p>
        <div style="margin:24px 0;padding:20px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Login credentials</p>
          <p style="margin:0 0 8px;font-size:15px;"><strong>User ID:</strong> <span style="font-family:Consolas,Monaco,monospace;">${employeeIdHtml}</span></p>
          <p style="margin:0;font-size:15px;"><strong>Password:</strong> <em>Use the password you were given at registration or your most recently updated password.</em></p>
        </div>
        <p style="margin:28px 0;">
          <a href="${loginUrlRaw}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600;">
            Open FRIS sign-in
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;">Select your station on the map, then sign in with the User ID and your password.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:12px;color:#94a3b8;">If you have forgotten your password, please contact your ${companyName} administrator to reset it.</p>
      </div>
    `;

    const primarySender = senders[0];
    const mail: MailPayload = {
      from: `"${companyName}" <${primarySender?.email || process.env.EMAIL_USER || 'noreply@fris.app'}>`,
      replyTo: primarySender?.email,
      to: input.to,
      subject,
      text,
      html,
    };

    let lastError: unknown;
    let sawConnectionTimeout = false;

    for (const sender of senders) {
      try {
        await this.trySendWithSender(sender, {
          ...mail,
          from: `"${companyName}" <${sender.email}>`,
          replyTo: sender.email,
        });
        this.logger.log(
          `[USER ID REMINDER] Sent FRIS user ID reminder to ${input.to} via ${sender.email}`,
        );
        return { sent: true };
      } catch (error) {
        lastError = error;
        if (isConnectionTimeoutError(error)) {
          sawConnectionTimeout = true;
        }
        this.logger.error(
          `[USER ID REMINDER] Sender failed: ${sender.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (hasResend || sawConnectionTimeout) {
      const resendResult = await sendViaResendApi(mail);
      if (resendResult.ok) {
        this.logger.log(
          `[USER ID REMINDER] Sent FRIS user ID reminder to ${input.to} via Resend API`,
        );
        return { sent: true };
      }
      if (!lastError) {
        lastError = new Error(resendResult.error);
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === 'string'
          ? lastError
          : 'SMTP send failed';

    const suffix = sawConnectionTimeout ? ` ${railwaySmtpHint()}` : '';

    return {
      sent: false,
      error: `Could not send user ID reminder email (${message}).${suffix}`,
    };
  }

  async sendStalePendingApprovalsEmail(input: {
    to: string;
    approvals: Array<{
      name: string;
      employeeId: string;
      email: string;
      station: string;
      waitingHours: number;
    }>;
    reviewUrl: string;
  }): Promise<InviteEmailResult> {
    const senders = await this.getSenderCandidates();
    const hasResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());

    if (senders.length === 0 && !hasResend) {
      this.logger.warn(
        'No sender email configured — stale pending-approval alert not sent.',
      );
      return {
        sent: false,
        error:
          'Email is not configured. Set EMAIL_USER/EMAIL_PASS, RESEND_API_KEY, or add an active admin email.',
      };
    }

    const count = input.approvals.length;
    const subject = `Action required: ${count} pending registration approval${
      count === 1 ? '' : 's'
    } waiting over 24 hours`;
    const rowsText = input.approvals
      .map(
        (row) =>
          `- ${row.name} · ${row.employeeId || '—'} · ${row.email || '—'} · ${
            row.station || '—'
          } · waiting ${row.waitingHours}h`,
      )
      .join('\n');
    const text = [
      'Hello Superadmin,',
      '',
      `The following registration${count === 1 ? '' : 's'} ${
        count === 1 ? 'has' : 'have'
      } been pending approval for more than 24 hours. Please review and approve or reject them as soon as possible.`,
      '',
      rowsText,
      '',
      `Open pending approvals: ${input.reviewUrl}`,
    ].join('\n');

    const rowsHtml = input.approvals
      .map(
        (row) => `
          <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${this.escapeHtml(row.name)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:Consolas,Monaco,monospace;">${this.escapeHtml(row.employeeId || '—')}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${this.escapeHtml(row.email || '—')}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${this.escapeHtml(row.station || '—')}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${row.waitingHours}h</td>
          </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:720px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#059669,#0f766e);border-radius:16px;padding:24px;color:#fff;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;opacity:0.9;">FRIS Admin</p>
          <h1 style="margin:0;font-size:24px;">Pending approvals need action</h1>
        </div>
        <p style="font-size:15px;">Hello Superadmin,</p>
        <p style="font-size:15px;">
          <strong>${count}</strong> registration${count === 1 ? '' : 's'}
          ${count === 1 ? 'has' : 'have'} been waiting more than 24 hours.
          Please approve or reject them as soon as possible.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;">
          <thead>
            <tr style="background:#ecfdf5;text-align:left;">
              <th style="padding:8px 10px;">Name</th>
              <th style="padding:8px 10px;">Employee ID</th>
              <th style="padding:8px 10px;">Email</th>
              <th style="padding:8px 10px;">Station</th>
              <th style="padding:8px 10px;">Waiting</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin:28px 0;">
          <a href="${this.escapeHtml(input.reviewUrl)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:600;">
            Open pending approvals
          </a>
        </p>
      </div>
    `;

    const primarySender = senders[0];
    const mail: MailPayload = {
      from: `"FRIS Admin" <${primarySender?.email || process.env.EMAIL_USER || 'noreply@fris.app'}>`,
      replyTo: primarySender?.email,
      to: input.to,
      subject,
      text,
      html,
    };

    let lastError: unknown;
    let sawConnectionTimeout = false;

    for (const sender of senders) {
      try {
        await this.trySendWithSender(sender, {
          ...mail,
          from: `"FRIS Admin" <${sender.email}>`,
          replyTo: sender.email,
        });
        this.logger.log(
          `[PENDING APPROVAL ALERT] Sent to ${input.to} via ${sender.email}`,
        );
        return { sent: true };
      } catch (error) {
        lastError = error;
        if (isConnectionTimeoutError(error)) {
          sawConnectionTimeout = true;
        }
        this.logger.error(
          `[PENDING APPROVAL ALERT] Sender failed: ${sender.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (hasResend || sawConnectionTimeout) {
      const resendResult = await sendViaResendApi(mail);
      if (resendResult.ok) {
        this.logger.log(
          `[PENDING APPROVAL ALERT] Sent to ${input.to} via Resend API`,
        );
        return { sent: true };
      }
      if (!lastError) {
        lastError = new Error(resendResult.error);
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === 'string'
          ? lastError
          : 'SMTP send failed';

    const suffix = sawConnectionTimeout ? ` ${railwaySmtpHint()}` : '';

    return {
      sent: false,
      error: `Could not send pending-approval alert (${message}).${suffix}`,
    };
  }
}

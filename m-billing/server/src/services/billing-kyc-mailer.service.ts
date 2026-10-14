import { Injectable, Logger } from '@nestjs/common';
import {
  isValidEmail,
  normalizeAppPassword,
  sendViaGmail,
  sendViaResendApi,
  type MailPayload,
} from 'src/common/mail/mail-transport.util';

export type KycInviteMailInput = {
  to: string;
  airlineName: string;
  customerCode: string;
  stationCode: string;
  inviteUrl: string;
  expiresAt: Date;
};

@Injectable()
export class BillingKycMailerService {
  private readonly logger = new Logger(BillingKycMailerService.name);

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendInviteEmail(input: KycInviteMailInput): Promise<{ sent: boolean; error?: string }> {
    const to = String(input.to ?? '').trim().toLowerCase();
    if (!isValidEmail(to)) {
      return { sent: false, error: 'Invalid invite email' };
    }

    const expiry = input.expiresAt.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const subject = `KYC registration — ${input.airlineName} (${input.customerCode})`;
    const textBody = [
      `Hello,`,
      ``,
      `Please complete KYC for ${input.airlineName} (${input.customerCode}) at station ${input.stationCode}.`,
      `Open this secure link (no login required):`,
      input.inviteUrl,
      ``,
      `Link expires: ${expiry}`,
      ``,
      `If you did not expect this email, ignore it.`,
    ].join('\n');

    const htmlBody = `
      <p>Hello,</p>
      <p>Please complete KYC for <strong>${this.escapeHtml(input.airlineName)}</strong>
      (<strong>${this.escapeHtml(input.customerCode)}</strong>) at station
      <strong>${this.escapeHtml(input.stationCode)}</strong>.</p>
      <p><a href="${this.escapeHtml(input.inviteUrl)}" style="display:inline-block;padding:10px 16px;background:#1C0770;color:#fff;text-decoration:none;border-radius:8px;">
        Open KYC form
      </a></p>
      <p style="color:#666;font-size:13px;">Link expires: ${this.escapeHtml(expiry)}</p>
      <p style="color:#666;font-size:12px;">If you did not expect this email, ignore it.</p>
    `;

    const envEmail = String(process.env.EMAIL_USER || '').trim().toLowerCase();
    const envPass = normalizeAppPassword(process.env.EMAIL_PASS || '');
    const fromEmail =
      String(process.env.EMAIL_FROM || process.env.RESEND_FROM || envEmail || '').trim() ||
      'noreply@fris.app';
    const mail: MailPayload = {
      from: `"Bird Billing" <${fromEmail}>`,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    };

    if (envEmail && envPass && isValidEmail(envEmail)) {
      try {
        await sendViaGmail(envEmail, envPass, {
          ...mail,
          from: `"Bird Billing" <${envEmail}>`,
        });
        return { sent: true };
      } catch (e) {
        this.logger.warn(`Gmail KYC invite failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (process.env.RESEND_API_KEY) {
      try {
        await sendViaResendApi(mail);
        return { sent: true };
      } catch (e) {
        this.logger.warn(`Resend KYC invite failed: ${e instanceof Error ? e.message : e}`);
        return { sent: false, error: e instanceof Error ? e.message : 'Email send failed' };
      }
    }

    return {
      sent: false,
      error: 'No mail transport configured (EMAIL_USER/EMAIL_PASS or RESEND_API_KEY)',
    };
  }
}

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { sanitizeAttachmentBase64 } from '../../flight-cancellations/utils/cancellation-attachment.util';
import {
  buildBrandedOtpEmailHtml,
  buildBrandedOtpEmailPlainText,
  buildCancellationInfoEmailHtml,
  buildCancellationInfoEmailPlainText,
  type CancellationInfoEmailRow,
} from '../../flight-cancellations/utils/cancellation-info-email.template';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  AdminEmail,
  type AdminEmailDocument,
} from '../schema/admin-email.schema';

type OtpPurpose =
  | 'cancel-step-1'
  | 'cancel-step-2'
  | 'reopen-step-1'
  | 'reopen-step-2';
type CancellationAttachment = {
  fileName?: string;
  mimeType?: string;
  base64?: string;
};

@Injectable()
export class OtpMailerService {
  private readonly logger = new Logger(OtpMailerService.name);
  private readonly transporterCache = new Map<
    string,
    {
      transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
      expiresAt: number;
    }
  >();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectModel(AdminEmail.name)
    private readonly adminEmailModel: Model<AdminEmailDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private normalizeAppPassword(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
    // Gmail app passwords are 16 chars and often copied with spaces.
    return unquoted.replace(/\s+/g, '');
  }

  /** Primary SMTP identity: `.env` first so deploys without `adminEmails` rows still send mail. */
  private getEnvSenderCredentials(): {
    email: string;
    appPassword: string;
  } | null {
    const envEmail = String(process.env.EMAIL_USER || '')
      .trim()
      .toLowerCase();
    const envPass = this.normalizeAppPassword(process.env.EMAIL_PASS || '');
    if (!this.isValidEmail(envEmail) || !envPass) return null;
    return { email: envEmail, appPassword: envPass };
  }

  async getActiveEmailRecordOrThrow(): Promise<AdminEmailDocument> {
    const fromEnv = this.getEnvSenderCredentials();
    if (fromEnv) {
      return {
        email: fromEnv.email,
        appPassword: fromEnv.appPassword,
        isActive: true,
      } as AdminEmailDocument;
    }

    const activePrimary = await this.adminEmailModel
      .findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .exec();

    if (activePrimary) {
      return activePrimary;
    }

    // Backward compatibility for legacy values where isActive was stored as string/number.
    const activeLegacyValue = await this.adminEmailModel
      .findOne({
        isActive: { $in: [true, 'true', 1, '1'] } as unknown as boolean,
      })
      .sort({ updatedAt: -1 })
      .exec();
    if (activeLegacyValue) {
      return activeLegacyValue;
    }

    // Optional compatibility with a legacy collection name "adminEmail".
    const legacyCollection = this.connection.collection('adminEmail');
    const legacyDoc = await legacyCollection.findOne({
      isActive: { $in: [true, 'true', 1, '1'] },
    });
    if (legacyDoc?.email && legacyDoc?.appPassword) {
      const migrated = await this.adminEmailModel.create({
        email: String(legacyDoc.email).trim().toLowerCase(),
        appPassword: String(legacyDoc.appPassword),
        isActive: true,
      });
      return migrated;
    }

    throw new UnauthorizedException(
      'No sender email configured. Set EMAIL_USER and EMAIL_PASS in .env, or add an active record in adminEmails.',
    );
  }

  private async getFallbackActiveRecords(
    excludeEmail: string,
  ): Promise<AdminEmailDocument[]> {
    return this.adminEmailModel
      .find({
        isActive: true,
        email: { $ne: excludeEmail.toLowerCase() },
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  private getTransporter(
    senderEmail: string,
    appPassword: string,
  ): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    const normalizedPass = this.normalizeAppPassword(appPassword);
    const cacheKey = `${senderEmail.toLowerCase()}::${normalizedPass}`;
    const now = Date.now();
    const cached = this.transporterCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.transporter;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: normalizedPass,
      },
    });

    this.transporterCache.set(cacheKey, {
      transporter,
      expiresAt: now + this.cacheTtlMs,
    });

    return transporter;
  }

  async sendOtpEmail(params: {
    toEmail: string;
    otp: string;
    flightId: string;
    purpose: OtpPurpose;
  }): Promise<void> {
    if (!this.isValidEmail(params.toEmail)) {
      throw new UnauthorizedException('Invalid recipient email.');
    }

    const primary = await this.getActiveEmailRecordOrThrow();
    const fallback = await this.getFallbackActiveRecords(primary.email);
    const senders = [primary, ...fallback];

    const envEmail = String(process.env.EMAIL_USER || '')
      .trim()
      .toLowerCase();
    const envPass = this.normalizeAppPassword(process.env.EMAIL_PASS || '');
    if (this.isValidEmail(envEmail) && envPass) {
      const alreadyPresent = senders.some(
        (sender) => sender.email.toLowerCase() === envEmail,
      );
      if (!alreadyPresent) {
        senders.push({
          email: envEmail,
          appPassword: envPass,
          isActive: true,
        } as AdminEmailDocument);
      }
    }

    const purposeCopy = OtpMailerService.otpPurposeCopy(params.purpose);
    const subject = `${purposeCopy.title}: ${params.flightId}`;
    const otpParams = {
      otp: params.otp,
      title: purposeCopy.title,
      statusCaption: purposeCopy.caption,
      expiresNote: 'This OTP expires in 3 minutes and can be used only once.',
      details: [
        { label: 'Flight / Serial', value: params.flightId },
        { label: 'Purpose', value: purposeCopy.action },
      ],
      securityNote:
        'Do not share this code. Bird Group staff will never ask you for this OTP.',
      senderBrandName: 'Bird Group',
    };
    const html = buildBrandedOtpEmailHtml(otpParams);
    const text = buildBrandedOtpEmailPlainText(otpParams);

    await this.sendWithFallbackSenders({
      toEmail: params.toEmail,
      subject,
      html,
      text,
      senders,
    });
  }

  private static otpPurposeCopy(purpose: OtpPurpose): {
    title: string;
    caption: string;
    action: string;
  } {
    if (purpose === 'cancel-step-1') {
      return {
        title: 'Flight cancellation OTP',
        caption: 'CANCEL OTP',
        action: 'Verify cancellation (step 1)',
      };
    }
    if (purpose === 'cancel-step-2') {
      return {
        title: 'Final cancellation OTP',
        caption: 'FINAL CANCEL OTP',
        action: 'Confirm cancellation (step 2)',
      };
    }
    if (purpose === 'reopen-step-1') {
      return {
        title: 'Flight reopen OTP',
        caption: 'REOPEN OTP',
        action: 'Verify reopen (step 1)',
      };
    }
    return {
      title: 'Final flight reopen OTP',
      caption: 'FINAL REOPEN OTP',
      action: 'Confirm reopen (step 2)',
    };
  }

  private async sendWithFallbackSenders(params: {
    toEmail: string | string[];
    subject: string;
    html: string;
    text?: string;
    senders: AdminEmailDocument[];
    attachments?: Array<{
      filename: string;
      content: string;
      encoding: 'base64';
      contentType?: string;
    }>;
  }): Promise<void> {
    const recipients = (
      Array.isArray(params.toEmail) ? params.toEmail : [params.toEmail]
    )
      .map((v) =>
        String(v || '')
          .trim()
          .toLowerCase(),
      )
      .filter((v) => this.isValidEmail(v));
    if (recipients.length === 0) {
      throw new UnauthorizedException('Invalid recipient email.');
    }

    let lastError: unknown;
    const attemptedSenders: string[] = [];
    for (const sender of params.senders) {
      const normalizedPass = this.normalizeAppPassword(sender.appPassword);
      if (!this.isValidEmail(sender.email) || !normalizedPass) continue;
      try {
        attemptedSenders.push(sender.email.toLowerCase());
        const transporter = this.getTransporter(sender.email, normalizedPass);
        this.logger.log(
          `[OTP MAIL] Using sender ${sender.email} for recipient ${recipients.join(', ')}`,
        );
        await transporter.sendMail({
          from: `"Bird Group" <${sender.email}>`,
          to: recipients.join(', '),
          subject: params.subject,
          text: params.text,
          html: params.html,
          attachments: params.attachments,
        });
        return;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `[OTP MAIL] Sender failed: ${sender.email}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (typeof lastError === 'object' && lastError && 'code' in lastError) {
      throw new UnauthorizedException(
        `SMTP auth failed for configured sender email(s): ${attemptedSenders.join(', ')}. Check EMAIL_USER/EMAIL_PASS in .env or adminEmails app passwords.`,
      );
    }
    throw new UnauthorizedException(
      'Failed to send email with configured sender email(s).',
    );
  }

  async sendCancellationSummaryEmail(params: {
    toEmail: string | string[];
    verifiedBy: string;
    flight: {
      airlineName?: string;
      serialNumber?: string;
      flightNo?: string;
      aircraftType?: string;
      airlineRepresentativeName?: string;
      route?: string;
      staDate?: string;
      staTime?: string;
      stdDate?: string;
      stdTime?: string;
    };
    form: {
      intimationTime: string;
      intimatedBy: string;
      intimationPersonEmail?: string;
      intimationMode: string;
      intimationMedia?: string;
      proofNote?: string;
      attachment?: CancellationAttachment;
    };
  }): Promise<void> {
    const primary = await this.getActiveEmailRecordOrThrow();
    const fallback = await this.getFallbackActiveRecords(primary.email);
    const senders = [primary, ...fallback];

    const envEmail = String(process.env.EMAIL_USER || '')
      .trim()
      .toLowerCase();
    const envPass = this.normalizeAppPassword(process.env.EMAIL_PASS || '');
    if (this.isValidEmail(envEmail) && envPass) {
      const alreadyPresent = senders.some(
        (sender) => sender.email.toLowerCase() === envEmail,
      );
      if (!alreadyPresent) {
        senders.push({
          email: envEmail,
          appPassword: envPass,
          isActive: true,
        } as AdminEmailDocument);
      }
    }

    const subject = `Flight cancellation confirmed: ${
      params.flight.flightNo || params.flight.serialNumber || 'Unknown flight'
    }`;
    const intimationMedia =
      String(params.form.intimationMedia ?? '').trim() ||
      String(params.form.attachment?.fileName ?? '').trim() ||
      '';
    const emailRow: CancellationInfoEmailRow = {
      instanceSerial: String(params.flight.serialNumber ?? '').trim(),
      cancelledDate: String(params.flight.staDate ?? '').trim(),
      flightNo: String(params.flight.flightNo ?? '').trim(),
      airlineName: String(params.flight.airlineName ?? '').trim(),
      staDate: String(params.flight.staDate ?? '').trim(),
      staTime: String(params.flight.staTime ?? '').trim(),
      stdDate: String(params.flight.stdDate ?? '').trim(),
      stdTime: String(params.flight.stdTime ?? '').trim(),
      route: String(params.flight.route ?? '').trim(),
      reason: String(params.form.proofNote ?? '').trim(),
      intimatedBy: params.form.intimatedBy,
      intimationPersonEmail: params.form.intimationPersonEmail,
      intimationMedia,
      intimationTime: params.form.intimationTime,
      intimationMode: params.form.intimationMode,
    };
    const html = buildCancellationInfoEmailHtml(emailRow, {
      senderBrandName: 'Bird Group',
    });
    const text = buildCancellationInfoEmailPlainText(emailRow);

    const attachment = params.form.attachment;
    const cleanBase64 = sanitizeAttachmentBase64(attachment?.base64 ?? '');
    const attachments =
      cleanBase64 && (attachment?.fileName || '').trim()
        ? [
            {
              filename: String(attachment?.fileName || 'proof-of-intimation'),
              content: cleanBase64,
              encoding: 'base64' as const,
              contentType:
                String(attachment?.mimeType || '').trim() || undefined,
            },
          ]
        : undefined;

    await this.sendWithFallbackSenders({
      toEmail: params.toEmail,
      subject,
      html,
      text,
      senders,
      attachments,
    });
  }

  async sendReopenSummaryEmail(params: {
    toEmail: string | string[];
    verifiedBy: string;
    adminUserId?: string;
    flight: {
      airlineName?: string;
      serialNumber?: string;
      flightNo?: string;
      aircraftType?: string;
      airlineRepresentativeName?: string;
    };
    reopenedDate?: string;
  }): Promise<void> {
    const primary = await this.getActiveEmailRecordOrThrow();
    const fallback = await this.getFallbackActiveRecords(primary.email);
    const senders = [primary, ...fallback];

    const envEmail = String(process.env.EMAIL_USER || '')
      .trim()
      .toLowerCase();
    const envPass = this.normalizeAppPassword(process.env.EMAIL_PASS || '');
    if (this.isValidEmail(envEmail) && envPass) {
      const alreadyPresent = senders.some(
        (sender) => sender.email.toLowerCase() === envEmail,
      );
      if (!alreadyPresent) {
        senders.push({
          email: envEmail,
          appPassword: envPass,
          isActive: true,
        } as AdminEmailDocument);
      }
    }

    const subject = `Flight reopened: ${
      params.flight.flightNo || params.flight.serialNumber || 'Unknown flight'
    }`;
    const html = `
      <h3>Flight Reopened Confirmation</h3>
      <p><b>Verified by:</b> ${params.verifiedBy || '-'}</p>
      <p><b>Admin User ID:</b> ${params.adminUserId || '-'}</p>
      <p><b>Admin Password:</b> Not available in plain text (stored securely as hash).</p>
      <hr />
      <p><b>Airline:</b> ${params.flight.airlineName || '-'}</p>
      <p><b>Serial Number:</b> ${params.flight.serialNumber || '-'}</p>
      <p><b>Flight No:</b> ${params.flight.flightNo || '-'}</p>
      <p><b>Aircraft Type:</b> ${params.flight.aircraftType || '-'}</p>
      <p><b>Airline Representative:</b> ${
        params.flight.airlineRepresentativeName || '-'
      }</p>
      <p><b>Reopened Date (STA):</b> ${params.reopenedDate || '-'}</p>
    `;

    await this.sendWithFallbackSenders({
      toEmail: params.toEmail,
      subject,
      html,
      senders,
    });
  }

  async sendPasswordResetEmail(params: {
    toEmail: string;
    resetUrl: string;
  }): Promise<void> {
    const primary = await this.getActiveEmailRecordOrThrow();
    const fallback = await this.getFallbackActiveRecords(primary.email);
    const senders = [primary, ...fallback];

    const html = `
      <h3>Password reset request</h3>
      <p>You requested a password reset for your FRIS account.</p>
      <p><a href="${params.resetUrl}">Reset your password</a></p>
      <p>This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
    `;

    await this.sendWithFallbackSenders({
      toEmail: params.toEmail,
      subject: 'FRIS password reset',
      html,
      senders,
    });
  }

  /** Sends a one-time password for the employee forgot-password flow. Never log the OTP. */
  async sendPasswordResetOtpEmail(params: {
    toEmail: string;
    otp: string;
    expiresInMinutes: number;
  }): Promise<void> {
    if (!this.isValidEmail(params.toEmail)) {
      throw new UnauthorizedException('Invalid recipient email.');
    }

    const primary = await this.getActiveEmailRecordOrThrow();
    const fallback = await this.getFallbackActiveRecords(primary.email);
    const senders = [primary, ...fallback];

    const otpParams = {
      otp: params.otp,
      title: 'Password reset OTP',
      statusCaption: 'RESET OTP',
      expiresNote: `This OTP expires in ${params.expiresInMinutes} minutes and can be used only once.`,
      details: [{ label: 'Account', value: 'FRIS password reset' }],
      securityNote:
        'If you did not request this, contact your administrator immediately.',
      senderBrandName: 'Bird Group',
    };

    await this.sendWithFallbackSenders({
      toEmail: params.toEmail,
      subject: 'FRIS password reset OTP',
      html: buildBrandedOtpEmailHtml(otpParams),
      text: buildBrandedOtpEmailPlainText(otpParams),
      senders,
    });
  }

  async sendPasswordChangedConfirmationEmail(params: {
    toEmail: string;
  }): Promise<void> {
    if (!this.isValidEmail(params.toEmail)) {
      throw new UnauthorizedException('Invalid recipient email.');
    }

    const primary = await this.getActiveEmailRecordOrThrow();
    const fallback = await this.getFallbackActiveRecords(primary.email);
    const senders = [primary, ...fallback];

    const html = `
      <h3>Password Changed Successfully</h3>
      <p>Hello,</p>
      <p>Your password has been successfully changed.</p>
      <p>If you did not perform this action, please contact your administrator immediately.</p>
      <p>Thank you.</p>
    `;

    await this.sendWithFallbackSenders({
      toEmail: params.toEmail,
      subject: 'Password Changed Successfully',
      html,
      senders,
    });
  }
}

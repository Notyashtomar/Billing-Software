import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import {
  AdminEmail,
  type AdminEmailDocument,
} from '../../auth/schema/admin-email.schema';
import { SendPaxShiftReportEmailDto } from '../dto/send-pax-shift-report-email.dto';

const BIRD_SENDER_NAME = 'BIRD AIRPORT SERVICES';

@Injectable()
export class PaxShiftReportEmailService {
  private readonly logger = new Logger(PaxShiftReportEmailService.name);

  constructor(
    @InjectModel(AdminEmail.name)
    private readonly adminEmailModel: Model<AdminEmailDocument>,
  ) {}

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private normalizeAppPassword(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
  }

  private async getSenderCredentials(): Promise<{
    email: string;
    appPassword: string;
  }> {
    const envEmail = String(process.env.EMAIL_USER || '')
      .trim()
      .toLowerCase();
    const envPass = this.normalizeAppPassword(process.env.EMAIL_PASS || '');
    if (this.isValidEmail(envEmail) && envPass) {
      return { email: envEmail, appPassword: envPass };
    }
    const active = await this.adminEmailModel
      .findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    if (active?.email && active?.appPassword) {
      const appPassword = this.normalizeAppPassword(String(active.appPassword));
      if (appPassword) {
        return {
          email: String(active.email).trim().toLowerCase(),
          appPassword,
        };
      }
    }
    throw new UnauthorizedException(
      'No sender email configured. Set EMAIL_USER and EMAIL_PASS in .env, or add an active record in adminEmails.',
    );
  }

  private sanitizePdfBase64(raw: string): string {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return '';
    const comma = trimmed.indexOf(',');
    const base = comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
    return base.replace(/\s+/g, '');
  }

  private buildPlainText(dto: SendPaxShiftReportEmailDto): string {
    const custom = String(dto.emailBody ?? '').trim();
    if (custom) return custom;
    const serial = String(dto.flightSerial ?? '').trim();
    const airline = String(dto.airline ?? '').trim();
    const flightNo = String(dto.flightNo ?? '').trim();
    const lines = [
      String(dto.subject ?? '').trim() || 'PAX SHIFT REPORT',
      '',
      `Serial: ${serial || '—'}`,
      `Airline: ${airline || '—'}`,
      `Flight: ${flightNo || '—'}`,
      '',
      'The full report is attached as a PDF.',
      '',
      BIRD_SENDER_NAME,
    ];
    return lines.join('\n');
  }

  private buildHtml(dto: SendPaxShiftReportEmailDto): string {
    const serial = String(dto.flightSerial ?? '').trim() || '—';
    const airline = String(dto.airline ?? '').trim() || '—';
    const flightNo = String(dto.flightNo ?? '').trim() || '—';
    const summary = String(dto.emailBody ?? '')
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const heading = String(dto.subject ?? '').trim() || 'Pax Shift Report';
    return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">
  <p style="margin:0 0 12px;font-size:16px;font-weight:600;">${heading.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  <p style="margin:0 0 8px;">Serial <strong>${serial}</strong> · ${airline} · ${flightNo}</p>
  ${summary ? `<div style="margin:16px 0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">${summary}</div>` : '<p style="margin:16px 0;">The full report is attached as a PDF.</p>'}
  <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">${BIRD_SENDER_NAME}</p>
</body>
</html>`;
  }

  async sendReportEmail(
    dto: SendPaxShiftReportEmailDto,
  ): Promise<{ sent: true; toEmails: string[] }> {
    const recipients = Array.from(
      new Set(
        (dto.emails ?? [])
          .map((v) => String(v ?? '').trim().toLowerCase())
          .filter((v) => this.isValidEmail(v)),
      ),
    );
    if (recipients.length === 0) {
      throw new UnauthorizedException('At least one valid recipient email is required.');
    }

    const pdfBase64 = this.sanitizePdfBase64(dto.pdfBase64);
    if (!pdfBase64) {
      throw new InternalServerErrorException('PDF attachment is missing or invalid.');
    }

    const serial = String(dto.flightSerial ?? '').trim();
    const flightNo = String(dto.flightNo ?? '').trim();
    const safeSerial = serial.replace(/[^\w.-]+/g, '_') || 'flight';
    const filename =
      String(dto.pdfFilename ?? '').trim() ||
      `Pax-Shift-Report-${safeSerial}.pdf`;

    const subject =
      String(dto.subject ?? '').trim() ||
      `Pax Shift Report — ${flightNo || serial || 'Flight'}`;

    return this.sendMultiPdfReportEmail({
      emails: recipients,
      subject,
      textBody: this.buildPlainText(dto),
      htmlBody: this.buildHtml(dto),
      attachments: [{ filename, pdfBase64 }],
    });
  }

  async sendMultiPdfReportEmail(params: {
    emails: string[];
    subject: string;
    textBody: string;
    htmlBody: string;
    attachments: Array<{ filename: string; pdfBase64: string }>;
  }): Promise<{ sent: true; toEmails: string[] }> {
    const recipients = Array.from(
      new Set(
        (params.emails ?? [])
          .map((v) => String(v ?? '').trim().toLowerCase())
          .filter((v) => this.isValidEmail(v)),
      ),
    );
    if (recipients.length === 0) {
      throw new UnauthorizedException('At least one valid recipient email is required.');
    }

    const mailAttachments = (params.attachments ?? [])
      .map((a, i) => {
        const pdfBase64 = this.sanitizePdfBase64(a.pdfBase64);
        if (!pdfBase64) return null;
        const filename =
          String(a.filename ?? '').trim() || `Report-${i + 1}.pdf`;
        return {
          filename,
          content: pdfBase64,
          encoding: 'base64' as const,
          contentType: 'application/pdf',
        };
      })
      .filter((a): a is NonNullable<typeof a> => a != null);

    if (mailAttachments.length === 0) {
      throw new InternalServerErrorException('PDF attachment is missing or invalid.');
    }

    const sender = await this.getSenderCredentials();
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: sender.email, pass: sender.appPassword },
    });

    try {
      await transporter.sendMail({
        from: `"${BIRD_SENDER_NAME}" <${sender.email}>`,
        replyTo: sender.email,
        to: recipients.join(', '),
        subject: params.subject,
        text: params.textBody,
        html: params.htmlBody,
        attachments: mailAttachments,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'SMTP send failed';
      this.logger.error(`Report email failed: ${msg}`);
      throw new InternalServerErrorException(
        `Could not send email (${msg}). Check EMAIL_USER/EMAIL_PASS, app password, and that the From address matches the Gmail account.`,
      );
    }

    return { sent: true, toEmails: recipients };
  }
}

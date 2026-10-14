import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type MailPayload = {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function normalizeAppPassword(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isConnectionTimeoutError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return /connection timeout|timed out|ETIMEDOUT|ECONNRESET|ESOCKET/i.test(
    message,
  );
}

export function createGmailTransporter(
  senderEmail: string,
  appPassword: string,
): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: senderEmail,
      pass: normalizeAppPassword(appPassword),
    },
  });
}

export async function sendViaGmail(
  senderEmail: string,
  appPassword: string,
  mail: MailPayload,
): Promise<void> {
  const transporter = createGmailTransporter(senderEmail, appPassword);
  try {
    await transporter.sendMail({
      from: mail.from,
      replyTo: mail.replyTo,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } finally {
    try {
      transporter.close();
    } catch {
      // ignore
    }
  }
}

export async function sendViaResendApi(
  mail: MailPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const from =
    String(process.env.RESEND_FROM || process.env.EMAIL_FROM || '').trim() ||
    mail.from;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        reply_to: mail.replyTo,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        error: `Resend API ${response.status}: ${bodyText.slice(0, 160)}`,
      };
    }

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Resend failed');
    return { ok: false, error: message };
  }
}

export function railwaySmtpHint(): string {
  return 'Railway Free/Hobby blocks outbound SMTP (ports 587/465). Set RESEND_API_KEY + RESEND_FROM for HTTPS email, or upgrade to Railway Pro and redeploy.';
}

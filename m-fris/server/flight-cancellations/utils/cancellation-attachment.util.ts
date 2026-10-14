/** Max decoded proof file size (~6.3 MiB). Matches OTP DTO base64 ceiling. */
export const CANCELLATION_ATTACHMENT_MAX_BYTES = 6_500_000;

const MIME_RE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;
const MONGO_ID_RE = /^[a-fA-F0-9]{24}$/;

/** Same strip as cancellation confirmation email (`otp-mailer`). */
export function sanitizeAttachmentBase64(input: string): string {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return '';
  const comma = trimmed.indexOf(',');
  const base = comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  return base.replace(/\s+/g, '');
}

export function isMongoCancellationId(raw: string): boolean {
  return MONGO_ID_RE.test(String(raw ?? '').trim());
}

export function sanitizeAttachmentFileName(raw: string): string {
  const base = String(raw ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
  return cleaned || 'attachment';
}

export function sanitizeAttachmentMimeType(raw: string): string {
  const mime = String(raw ?? '')
    .trim()
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mime && MIME_RE.test(mime)) return mime;
  return 'application/octet-stream';
}

export function decodeAttachmentBase64(raw: string): Buffer | null {
  const payload = sanitizeAttachmentBase64(raw);
  if (!payload) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(payload, 'base64');
  } catch {
    return null;
  }
  if (!buf.length) return null;
  return buf;
}

export function asNodeBuffer(raw: unknown): Buffer | null {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === 'object' && raw !== null && 'buffer' in raw) {
    const inner = (raw as { buffer?: unknown }).buffer;
    if (inner instanceof ArrayBuffer) return Buffer.from(inner);
    if (Buffer.isBuffer(inner)) return inner;
    if (inner instanceof Uint8Array) return Buffer.from(inner);
  }
  return null;
}

export function buildContentDisposition(
  kind: 'inline' | 'attachment',
  fileName: string,
): string {
  const safe = sanitizeAttachmentFileName(fileName);
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

import {
  buildContentDisposition,
  decodeAttachmentBase64,
  isMongoCancellationId,
  sanitizeAttachmentFileName,
  sanitizeAttachmentMimeType,
} from './cancellation-attachment.util';

describe('cancellation-attachment.util', () => {
  it('accepts 24-hex cancellation ids only', () => {
    expect(isMongoCancellationId('64b1f2c3d4e5f678901234ab')).toBe(true);
    expect(isMongoCancellationId('send-email')).toBe(false);
    expect(isMongoCancellationId('')).toBe(false);
  });

  it('strips path segments from uploaded filenames', () => {
    expect(sanitizeAttachmentFileName('C:\\\\tmp\\\\proof.pdf')).toBe('proof.pdf');
    expect(sanitizeAttachmentFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAttachmentFileName('')).toBe('attachment');
  });

  it('falls back to octet-stream for invalid mime types', () => {
    expect(sanitizeAttachmentMimeType('application/pdf')).toBe('application/pdf');
    expect(sanitizeAttachmentMimeType('image/png; charset=utf-8')).toBe(
      'image/png',
    );
    expect(sanitizeAttachmentMimeType('text/html<script>')).toBe(
      'application/octet-stream',
    );
  });

  it('decodes raw and data-URL base64 payloads', () => {
    const hello = Buffer.from('hello');
    expect(decodeAttachmentBase64(hello.toString('base64'))?.equals(hello)).toBe(
      true,
    );
    expect(
      decodeAttachmentBase64(
        `data:text/plain;base64,${hello.toString('base64')}`,
      )?.equals(hello),
    ).toBe(true);
    expect(
      decodeAttachmentBase64(
        `data:text/plain;charset=utf-8;base64,${hello.toString('base64')}`,
      )?.equals(hello),
    ).toBe(true);
    expect(decodeAttachmentBase64('')).toBeNull();
  });

  it('builds RFC 5987 content-disposition headers', () => {
    const header = buildContentDisposition('inline', 'proof (1).pdf');
    expect(header.startsWith('inline; filename="proof (1).pdf"')).toBe(true);
    expect(header).toContain("filename*=UTF-8''proof%20(1).pdf");
  });
});

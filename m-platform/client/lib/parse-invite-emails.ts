const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedInviteEmails = {
  /** Valid, deduplicated emails ready to send. */
  emails: string[];
  /** Tokens that look like emails but fail validation. */
  invalid: string[];
  /** Trailing token still being typed (not validated yet). */
  pending: string | null;
  /** How many duplicate addresses were removed. */
  duplicateCount: number;
};

function cleanToken(token: string): string {
  return token
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[.,;]+$/, '')
    .toLowerCase();
}

function tokenizeInviteEmailInput(raw: string): string[] {
  const normalized = raw.replace(/\r/g, '');
  const tokens: string[] = [];

  for (const segment of normalized.split(/[\n,;\t]+/)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const bracketMatch = trimmed.match(/<([^<>@\s]+@[^<>\s]+)>/);
    if (bracketMatch) {
      tokens.push(cleanToken(bracketMatch[1]));
      continue;
    }

    if (/\s/.test(trimmed) && trimmed.includes('@')) {
      for (const part of trimmed.split(/\s+/)) {
        const cleaned = cleanToken(part);
        if (cleaned) tokens.push(cleaned);
      }
      continue;
    }

    const cleaned = cleanToken(trimmed);
    if (cleaned) tokens.push(cleaned);
  }

  return tokens;
}

function getPendingInviteToken(raw: string): string | null {
  const trimmed = raw.trimEnd();
  if (!trimmed) return null;

  const lastChar = trimmed[trimmed.length - 1];
  if (/[\n,;\t]/.test(lastChar)) return null;

  const lastSegment = trimmed.split(/[\n,;\t]/).pop()?.trim() ?? '';
  if (!lastSegment) return null;

  const lastPart = cleanToken(lastSegment.split(/\s+/).pop() ?? '');
  if (!lastPart) return null;
  if (EMAIL_RE.test(lastPart)) return null;
  if (lastPart.includes('@')) return null;

  return lastPart;
}

export function parseInviteEmailInput(raw: string): ParsedInviteEmails {
  const pending = getPendingInviteToken(raw);
  const tokens = tokenizeInviteEmailInput(raw);

  const filteredTokens =
    pending && tokens.length > 0 && tokens[tokens.length - 1] === cleanToken(pending)
      ? tokens.slice(0, -1)
      : tokens;

  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const token of filteredTokens) {
    if (!EMAIL_RE.test(token)) {
      invalid.push(token);
      continue;
    }
    if (seen.has(token)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(token);
    emails.push(token);
  }

  return { emails, invalid, pending, duplicateCount };
}

export function isValidInviteEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

export function formatInviteEmailInput(raw: string): string {
  const { emails } = parseInviteEmailInput(raw);
  return emails.join('\n');
}

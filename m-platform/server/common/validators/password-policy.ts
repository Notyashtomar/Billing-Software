import { randomBytes } from 'node:crypto';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_PATTERNS = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /\d/,
  special: /[^A-Za-z0-9]/,
} as const;

export const PASSWORD_POLICY_MESSAGES = {
  required: 'password is required',
  string: 'password must be a string',
  minLength: `password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  maxLength: `password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
  uppercase: 'password must contain at least 1 uppercase letter',
  lowercase: 'password must contain at least 1 lowercase letter',
  number: 'password must contain at least 1 number',
  special: 'password must contain at least 1 special character',
} as const;

export function normalizePasswordInput(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function getPasswordPolicyMessages(value: string): string[] {
  const password = String(normalizePasswordInput(value) ?? '');
  const messages: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    messages.push(PASSWORD_POLICY_MESSAGES.minLength);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    messages.push(PASSWORD_POLICY_MESSAGES.maxLength);
  }
  if (!PASSWORD_POLICY_PATTERNS.uppercase.test(password)) {
    messages.push(PASSWORD_POLICY_MESSAGES.uppercase);
  }
  if (!PASSWORD_POLICY_PATTERNS.lowercase.test(password)) {
    messages.push(PASSWORD_POLICY_MESSAGES.lowercase);
  }
  if (!PASSWORD_POLICY_PATTERNS.number.test(password)) {
    messages.push(PASSWORD_POLICY_MESSAGES.number);
  }
  if (!PASSWORD_POLICY_PATTERNS.special.test(password)) {
    messages.push(PASSWORD_POLICY_MESSAGES.special);
  }

  return messages;
}

/** Meets password policy — used for admin "shoot credentials" resets. */
export function generateTemporaryLoginPassword(): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(14);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  // Guarantee character classes regardless of random draw.
  return `Aa1!${out}`.slice(0, 16);
}

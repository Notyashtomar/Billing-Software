/** Mirrors server password policy for client-side validation. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_PATTERNS = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /\d/,
  special: /[^A-Za-z0-9]/,
} as const;

export const PASSWORD_RESET_OTP_LENGTH = 6;
export const PASSWORD_RESET_RESEND_COOLDOWN_SEC = 60;

export function getClientPasswordPolicyMessages(password: string): string[] {
  const value = String(password ?? '');
  const messages: string[] = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    messages.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    messages.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (!PASSWORD_POLICY_PATTERNS.uppercase.test(value)) {
    messages.push('Password must include at least one uppercase letter.');
  }
  if (!PASSWORD_POLICY_PATTERNS.lowercase.test(value)) {
    messages.push('Password must include at least one lowercase letter.');
  }
  if (!PASSWORD_POLICY_PATTERNS.number.test(value)) {
    messages.push('Password must include at least one number.');
  }
  if (!PASSWORD_POLICY_PATTERNS.special.test(value)) {
    messages.push('Password must include at least one special character.');
  }

  return messages;
}

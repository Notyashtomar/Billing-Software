/** Password-reset OTP settings (employee forgot-password flow). */
export const PASSWORD_RESET_OTP = {
  PURPOSE: 'password-reset' as const,
  LENGTH: 6,
  /** OTP validity window. */
  TTL_MS: 10 * 60 * 1000,
  /** Max OTP emails per employee within the rate window. */
  RATE_LIMIT: 3,
  /** Sliding window for OTP send rate limiting. */
  RATE_WINDOW_MS: 15 * 60 * 1000,
  /** Max wrong OTP guesses before the code is invalidated. */
  MAX_TRIES: 5,
  BCRYPT_ROUNDS: 10,
} as const;

export const PASSWORD_RESET_OTP_MESSAGES = {
  EMPLOYEE_REQUIRED: 'Employee ID or email is required.',
  EMPLOYEE_NOT_FOUND: 'No account found for that employee ID or email.',
  USER_ID_REQUIRED: 'User ID or email is required.',
  USER_ID_NOT_FOUND: 'No account found for that user ID or email.',
  EMAIL_NOT_REGISTERED: 'Email not registered for this employee.',
  EMAIL_NOT_REGISTERED_ADMIN: 'Email not registered for this account.',
  OTP_SENT: 'OTP has been sent to your registered email.',
  OTP_REQUIRED: 'OTP is required.',
  OTP_INVALID_FORMAT: 'OTP must be a 6-digit number.',
  OTP_NOT_FOUND: 'OTP not found. Please send OTP again.',
  OTP_EXPIRED: 'OTP expired. Please send OTP again.',
  OTP_ALREADY_USED: 'OTP already used. Please request a new OTP.',
  OTP_INCORRECT: 'Incorrect OTP.',
  OTP_TOO_MANY_TRIES: 'Too many invalid OTP attempts. Please request a new OTP.',
  OTP_VERIFIED: 'OTP verified. You can set a new password.',
  OTP_NOT_VERIFIED: 'Please verify OTP before setting a new password.',
  PASSWORDS_MISMATCH: 'Passwords do not match.',
  PASSWORD_RESET_SUCCESS: 'Password updated successfully. You can sign in with your new password.',
  EMAIL_SEND_FAILED: 'Failed to send email. Please try again later.',
  RATE_LIMIT: 'Too many OTP requests. Please try again later.',
  SERVER_ERROR: 'Something went wrong. Please try again later.',
} as const;

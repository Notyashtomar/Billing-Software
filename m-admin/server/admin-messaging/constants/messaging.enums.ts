export const MESSAGE_TYPES = ['email', 'otp', 'sms', 'notification'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'failed',
  'retrying',
  'dead_letter',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const OTP_STATUSES = [
  'generated',
  'verified',
  'failed',
  'expired',
  'resent',
  'abuse',
] as const;
export type OtpStatus = (typeof OTP_STATUSES)[number];

export const OTP_FAILURE_LABELS: Record<string, string> = {
  expired: 'Expired OTP',
  invalid: 'Invalid OTP',
  max_attempts: 'Max Attempts Exceeded',
  user_cancelled: 'User Cancelled',
  provider_failure: 'Provider Failure',
  network_timeout: 'Network Timeout',
  blocked_number: 'Blocked Number',
};

export const OTP_FAILURE_REASONS = [
  'expired',
  'invalid',
  'max_attempts',
  'user_cancelled',
  'provider_failure',
  'network_timeout',
  'blocked_number',
] as const;
export type OtpFailureReason = (typeof OTP_FAILURE_REASONS)[number];

export const MESSAGING_MODULES = [
  'Authentication',
  'Access Control',
  'Reports',
  'Contracts',
  'Dashboard',
  'Notifications',
  'Station',
  'Flight Operations',
] as const;

export const QUEUE_NAMES = [
  'smtp',
  'otp',
  'notification',
  'failed',
  'retry',
  'dead_letter',
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

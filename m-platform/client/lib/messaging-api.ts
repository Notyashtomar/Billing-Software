import { getApiBase } from '@/lib/api';

export type MessagingKpis = {
  messagesSentToday: number;
  emailsSent: number;
  otpsGenerated: number;
  smsSent: number;
  deliveryRate: number;
  otpSuccessRate: number;
  failedDeliveries: number;
  pendingQueue: number;
};

export type OtpHealth = {
  otpRequestsToday: number;
  otpVerified: number;
  otpFailed: number;
  otpExpired: number;
  otpResent: number;
  otpAbuseAttempts: number;
  avgVerificationTimeMs: number;
  successPercentage: number;
};

export type OtpFailureRow = {
  reason: string;
  label: string;
  count: number;
};

export type OtpSecurityItem = {
  id: string;
  label: string;
  count: number;
  tone: 'emerald' | 'amber' | 'rose';
};

export type MessagingActivityRow = {
  id: string;
  messageId: string;
  timestamp: string;
  messageType: string;
  recipient: string;
  module: string;
  status: string;
  provider: string;
  deliveryTimeMs: number | null;
  sentAt: string | null;
  deliveredAt: string | null;
  errorCode?: string;
  errorMessage?: string;
  retryCount?: number;
};

export type MessagingQuery = {
  datePreset?: string;
  fromDate?: string;
  toDate?: string;
  messageType?: string;
  status?: string;
  module?: string;
  recipient?: string;
  cursor?: string;
  limit?: number;
};

export type MessagingActivityResponse = {
  data: MessagingActivityRow[];
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
};

export type MessageDetail = MessagingActivityRow & {
  requestId: string;
  templateName: string;
  subject: string;
  errorCode: string;
  errorMessage: string;
  retryCount: number;
  metadata: Record<string, unknown> | null;
  deliveryLogs: { at: Date | string; event: string; detail: string }[];
  openEvents: { at?: Date | string; client?: string }[];
  clickEvents: unknown[];
  otp: {
    otpGenerated?: string;
    otpVerified?: string;
    verificationTimeMs?: number;
    retryCount?: number;
    device?: string;
    ipAddress?: string;
    riskScore?: number;
    status?: string;
  } | null;
  bounceInfo: { code?: string; message?: string } | null;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { message?: unknown })?.message === 'string'
        ? (data as { message: string }).message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function buildMessagingExportUrl(query: MessagingQuery, format: 'csv' | 'xlsx' | 'pdf') {
  return `${getApiBase()}/admin/messaging/export${buildQuery({ ...query, format })}`;
}

export async function fetchMessagingKpis(query: MessagingQuery = {}) {
  return parseJson<MessagingKpis>(
    await fetch(`${getApiBase()}/admin/messaging/kpis${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchOtpHealth(query: MessagingQuery = {}) {
  return parseJson<OtpHealth>(
    await fetch(`${getApiBase()}/admin/messaging/otp-health${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchOtpFailures(query: MessagingQuery = {}) {
  return parseJson<OtpFailureRow[]>(
    await fetch(`${getApiBase()}/admin/messaging/otp-failures${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchOtpSecurity(query: MessagingQuery = {}) {
  return parseJson<{ suspiciousActivity: number; items: OtpSecurityItem[]; since: string }>(
    await fetch(`${getApiBase()}/admin/messaging/otp-security${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchEmailDelivery(query: MessagingQuery = {}) {
  return parseJson<Record<string, number>>(
    await fetch(`${getApiBase()}/admin/messaging/email-delivery${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchDeliverability(query: MessagingQuery = {}) {
  return parseJson<Record<string, number | string>>(
    await fetch(`${getApiBase()}/admin/messaging/deliverability${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchMessagingQueues() {
  return parseJson<{
    queues: {
      name: string;
      currentCount: number;
      oldestMessage: string | null;
      avgProcessingTimeMs: number;
      status: string;
      ageMinutes: number;
    }[];
  }>(await fetch(`${getApiBase()}/admin/messaging/queues`, { credentials: 'include' }));
}

export async function fetchMessagingCharts(query: MessagingQuery = {}) {
  return parseJson<{
    messagesPerHour: { label: string; value: number }[];
    otpSuccessTrend: { label: string; value: number }[];
    deliveryRateTrend: { label: string; value: number }[];
    failureTrend: { label: string; value: number }[];
  }>(
    await fetch(`${getApiBase()}/admin/messaging/charts${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchMessagingAlerts() {
  return parseJson<{
    alerts: {
      id: string;
      severity: 'critical' | 'warning' | 'info';
      title: string;
      detail: string;
      active: boolean;
    }[];
  }>(await fetch(`${getApiBase()}/admin/messaging/alerts`, { credentials: 'include' }));
}

export async function fetchMessagingTemplates() {
  return parseJson<{
    templates: {
      templateName: string;
      messageType: string;
      usageCount: number;
      lastUpdated: string | null;
      status: string;
    }[];
  }>(await fetch(`${getApiBase()}/admin/messaging/templates`, { credentials: 'include' }));
}

export async function fetchMessagingActivity(query: MessagingQuery) {
  return parseJson<MessagingActivityResponse>(
    await fetch(`${getApiBase()}/admin/messaging/activity${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchMessagingFailures(query: MessagingQuery) {
  return parseJson<MessagingActivityResponse>(
    await fetch(`${getApiBase()}/admin/messaging/failures${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchMessageDetail(messageId: string) {
  return parseJson<MessageDetail>(
    await fetch(`${getApiBase()}/admin/messaging/messages/${encodeURIComponent(messageId)}`, {
      credentials: 'include',
    }),
  );
}

export async function sendTestEmail(toEmail?: string) {
  return parseJson<{ success: boolean; message: string }>(
    await fetch(`${getApiBase()}/admin/messaging/test-email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toEmail }),
    }),
  );
}

export async function sendTestOtp(toEmail?: string) {
  return parseJson<{ success: boolean; message: string }>(
    await fetch(`${getApiBase()}/admin/messaging/test-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toEmail }),
    }),
  );
}

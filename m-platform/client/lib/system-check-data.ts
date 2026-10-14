import type { AdminAnalyticsSnapshot } from '@/lib/admin-analytics';
import type { DashboardAdminTile, DashboardAdminTileAction, DashboardTileBadge, SystemCheckTileKey } from '@/lib/admin-dashboard-data';
import type { AdminSupportTicketListItem } from '@/lib/support-tickets-api';
import { formatDatabaseStatusLabel } from '@/lib/system-health-api';
import type { AdminActivityLog } from '@/lib/user-registration-api';
import type { StationRecord } from '@/lib/stationAnalyticsMock';

/** Matches server defaults in protection-env.ts */
export const API_GATEWAY_GLOBAL_LIMIT_PER_MIN = 600;
export const API_GATEWAY_AUTH_LIMIT_PER_MIN = 30;
export const API_GATEWAY_REPORTS_LIMIT_PER_MIN = 180;
export const API_GATEWAY_SLA_TARGET_MS = 300;

export type SystemCheckStatusTone = 'ok' | 'warn' | 'error' | 'neutral';

export type SystemCheckDetailRow = {
  label: string;
  value: string;
};

export type SystemCheckInsight = {
  id: string;
  label: string;
  meta?: string;
  href?: string;
  tone?: SystemCheckStatusTone;
  /** Shown when the event is opened. */
  detail?: string;
  impact?: string;
  nextStep?: string;
};

export type SystemCheckUptimeLive = {
  human: string;
  seconds?: number;
  anchorIso: string;
  isLive: boolean;
};

export type SystemCheckSection = Omit<DashboardAdminTile, 'action'> & {
  details: SystemCheckDetailRow[];
  status: SystemCheckStatusTone;
  statusLabel: string;
  insights: SystemCheckInsight[];
  systemEvents?: SystemCheckInsight[];
  action?: { label: string; href: string } | DashboardAdminTileAction;
  uptimeLive?: SystemCheckUptimeLive;
};

export function formatLiveUptimeSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

export type AuditStats = {
  eventsToday: number;
  creates: number;
  updates: number;
  deletes: number;
  rejections: number;
  others: number;
  failuresToday: number;
  lastEventLabel: string;
  lastEventAt?: string;
  recent: AdminActivityLog[];
};

export function auditBreakdownTotal(
  audit: Pick<AuditStats, 'creates' | 'updates' | 'deletes' | 'rejections' | 'others'>,
): number {
  return audit.creates + audit.updates + audit.deletes + audit.rejections + audit.others;
}

function classifyAuditAction(action: string): 'create' | 'update' | 'delete' | 'rejection' | 'other' {
  const normalized = action.toLowerCase();
  if (/delete|removed|revoked/.test(normalized)) return 'delete';
  if (/reject|denied/.test(normalized)) return 'rejection';
  if (/create|invite\.created|submitted/.test(normalized)) return 'create';
  if (/update|approved|opened|password/.test(normalized)) return 'update';
  return 'other';
}

function insightToneForAuditLog(log: AdminActivityLog): SystemCheckStatusTone {
  if (isFailureActivity(log)) return 'error';
  const kind = classifyAuditAction(log.action);
  if (kind === 'delete' || kind === 'rejection') return 'warn';
  if (kind === 'create') return 'ok';
  return 'neutral';
}

export function resolveAuditStatus(
  audit: AuditStats,
  pendingReviews: number,
): SystemCheckStatusTone {
  if (audit.failuresToday > 0) return 'error';
  if (audit.deletes > 0 || audit.rejections > 0 || pendingReviews > 0) return 'warn';
  if (audit.eventsToday > 0) return 'ok';
  return 'neutral';
}

export type IncidentStats = {
  open: number;
  closed: number;
  critical: number;
  minor: number;
  urgent: number;
  lastResolvedLabel: string;
  openTickets: AdminSupportTicketListItem[];
};

function isToday(iso: string | undefined) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatRelativeTime(iso: string | undefined) {
  if (!iso) return 'Unknown';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'Unknown';
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatCheckedAt(iso: string | undefined) {
  if (!iso) return 'Unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatActivityAction(action: string) {
  return action
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' · ');
}

function isCriticalTicket(ticket: AdminSupportTicketListItem) {
  const urgency = ticket.urgency?.toLowerCase() ?? '';
  const issueType = ticket.issueType ?? '';
  return (
    urgency === 'urgent' ||
    issueType === 'Major' ||
    issueType === 'Catastrophic' ||
    issueType === 'Show stopper'
  );
}

function isMinorTicket(ticket: AdminSupportTicketListItem) {
  return !isCriticalTicket(ticket);
}

export function computeAuditStats(activity: AdminActivityLog[]): AuditStats {
  const today = activity.filter((log) => isToday(log.createdAt));

  let creates = 0;
  let updates = 0;
  let deletes = 0;
  let rejections = 0;
  let others = 0;
  let failuresToday = 0;

  for (const log of today) {
    const kind = classifyAuditAction(log.action);
    if (isFailureActivity(log)) failuresToday += 1;
    if (kind === 'create') creates += 1;
    else if (kind === 'update') updates += 1;
    else if (kind === 'delete') deletes += 1;
    else if (kind === 'rejection') rejections += 1;
    else others += 1;
  }

  const eventsToday = creates + updates + deletes + rejections + others;

  const recent = [...activity]
    .sort((a, b) => {
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return tb - ta;
    })
    .slice(0, 8);

  const latest = recent[0];

  return {
    eventsToday,
    creates,
    updates,
    deletes,
    rejections,
    others,
    failuresToday,
    lastEventLabel: latest ? formatActivityAction(latest.action) : 'No events logged',
    lastEventAt: latest?.createdAt,
    recent,
  };
}

export function computeIncidentStats(
  openTickets: AdminSupportTicketListItem[],
  closedTickets: AdminSupportTicketListItem[],
): IncidentStats {
  const critical = openTickets.filter(isCriticalTicket).length;
  const minor = openTickets.filter(isMinorTicket).length;
  const urgent = openTickets.filter((t) => t.urgency?.toLowerCase() === 'urgent').length;

  const lastResolved = [...closedTickets]
    .sort((a, b) => {
      const ta = new Date(a.adminResolvedAt ?? a.closedAt ?? a.raisedAt ?? 0).getTime();
      const tb = new Date(b.adminResolvedAt ?? b.closedAt ?? b.raisedAt ?? 0).getTime();
      return tb - ta;
    })[0];

  return {
    open: openTickets.length,
    closed: closedTickets.length,
    critical,
    minor,
    urgent,
    lastResolvedLabel: lastResolved
      ? formatRelativeTime(lastResolved.adminResolvedAt ?? lastResolved.closedAt ?? lastResolved.raisedAt)
      : 'No resolved tickets',
    openTickets: openTickets.slice(0, 5),
  };
}

export function getAffectedStations(stations: StationRecord[]) {
  return stations
    .filter((station) => station.status === 'Offline' || station.status === 'Maintenance' || station.status === 'Delayed')
    .sort((a, b) => {
      const rank = (status: StationRecord['status']) =>
        status === 'Offline' ? 0 : status === 'Maintenance' ? 1 : 2;
      return rank(a.status) - rank(b.status);
    });
}

export type SystemDowntimeStats = {
  activeIssues: number;
  status: SystemCheckStatusTone;
  lastCheckedAt: string;
  details: SystemCheckDetailRow[];
  insights: SystemCheckInsight[];
};

function isFailureActivity(log: AdminActivityLog): boolean {
  const haystack = `${log.action} ${JSON.stringify(log.metadata ?? {})}`.toLowerCase();
  return /fail|error|reject|denied|timeout|crash|unavailable|offline/.test(haystack);
}

function readFailureReason(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return '';
  for (const key of ['message', 'error', 'reason', 'detail']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function inferAffectedSurface(action: string): string {
  const normalized = action.toLowerCase();
  if (/login|auth|session|password|otp/.test(normalized)) return 'Login & authentication';
  if (/register|invite|onboarding|approval/.test(normalized)) return 'Registration & onboarding';
  if (/ticket|support/.test(normalized)) return 'Support tickets';
  if (/station|airport/.test(normalized)) return 'Stations & operations';
  if (/user|employee|department/.test(normalized)) return 'User management';
  if (/export|backup/.test(normalized)) return 'Export & backup';
  if (/health|ready|api/.test(normalized)) return 'API & system health';
  return 'Admin panel';
}

/** FRIS application downtime derived from health checks and recent failure activity. */
export function computeSystemDowntime(snapshot: AdminAnalyticsSnapshot): SystemDowntimeStats {
  const { health, healthFull, registrationActivity } = snapshot;
  const checkedAt = health.checkedAt;
  const latency = health.databaseLatencyMs ?? 0;
  const dbHealthy = health.databaseStatus === 'online';
  const heapPressure = healthFull?.process?.heapPressurePct ?? null;
  const events: SystemCheckInsight[] = [];

  if (health.databaseStatus === 'offline') {
    events.push({
      id: 'db-offline',
      label: 'Database offline — dashboard, stations, and user pages cannot load',
      meta: formatCheckedAt(checkedAt),
      tone: 'error',
      href: '/admin/system-check#database',
      detail:
        'The latest health check could not reach the database. FRIS has no place to read or save flights, users, stations, tickets, or admin records.',
      impact:
        'Dashboard, station pages, user management, and any screen that loads saved data will fail or stay empty until the database answers again.',
      nextStep:
        'Check the database host, credentials, and network from the API server. Refresh this page after the database status returns to online.',
    });
  } else if (health.databaseStatus === 'unknown') {
    events.push({
      id: 'db-unknown',
      label: 'Database readiness unknown — API calls may fail intermittently',
      meta: formatCheckedAt(checkedAt),
      tone: 'warn',
      href: '/admin/system-check#database',
      detail:
        'The API is running, but the readiness check could not confirm the database. Some requests may succeed while others time out or return an error.',
      impact:
        'Data-backed pages can load only in part. A user may see a list and then fail when opening or saving a record.',
      nextStep:
        'Open Database status and run the check again. If it stays unknown, look at the API logs for connection errors before treating this as a full outage.',
    });
  }

  if (healthFull?.mongoStatus === 'down') {
    events.push({
      id: 'mongo-down',
      label: 'MongoDB ping failed — persistence layer unavailable',
      meta: formatCheckedAt(checkedAt),
      tone: 'error',
      href: '/admin/system-check#database',
      detail:
        'The API process answered, but the MongoDB ping failed. Nothing new can be stored, and existing records cannot be loaded.',
      impact:
        'Creates, edits, and deletes across FRIS are blocked. A page that already has data on screen may still look normal until the next refresh.',
      nextStep:
        'Confirm the MongoDB cluster is reachable from the API host and that the connection string is valid. Retry the health check after the ping succeeds.',
    });
  }

  if (healthFull?.livenessStatus !== 'ok') {
    events.push({
      id: 'liveness-degraded',
      label: 'API process unhealthy — core FRIS routes may be crashing',
      meta: formatCheckedAt(checkedAt),
      tone: 'error',
      href: '/admin/system-check#api',
      detail:
        'The API liveness probe is not OK. The FRIS server process is unhealthy and may be restarting, stuck, or failing on core routes.',
      impact:
        'Login, flight pages, and admin actions can fail even when the database itself is fine. Users may be signed out or see a blank error.',
      nextStep:
        'Review the API process logs. Restart the service if the probe stays degraded, then confirm GET /health returns OK.',
    });
  }

  if (dbHealthy && latency >= 500) {
    events.push({
      id: 'api-timeout',
      label: 'API calls not responding in time — pages may hang or error',
      meta: formatCheckedAt(checkedAt),
      tone: 'error',
      href: '/admin/system-check#api',
      detail: `The ready check took ${latency} ms, past the 500 ms failure line. Requests reach the server but do not finish in time for a normal page load.`,
      impact:
        'Screens can spin, time out, or show only part of the data. People may retry the same save and create duplicates.',
      nextStep:
        'Compare this ready ping with database latency. If both stay high, reduce heavy queries or add API capacity before users keep retrying.',
    });
  } else if (dbHealthy && latency >= 300) {
    events.push({
      id: 'api-slow',
      label: 'Elevated API latency — slow loads across the application',
      meta: formatCheckedAt(checkedAt),
      tone: 'warn',
      href: '/admin/system-check#api',
      detail: `The ready check took ${latency} ms. That is above the 300 ms warning line, so pages are usable but slower than the normal target.`,
      impact:
        'Lists, dashboards, and saves will feel delayed across FRIS. The app is still up; it is not keeping its usual response time.',
      nextStep:
        'Watch the ready ping on the API card. Investigate if it stays above 300 ms, especially during busy station hours.',
    });
  }

  if (heapPressure != null && heapPressure >= 90) {
    events.push({
      id: 'memory-critical',
      label: 'Critical memory pressure — server may drop incoming requests',
      meta: formatCheckedAt(checkedAt),
      tone: 'error',
      href: '/admin/system-check#health',
      detail: `The API process is using ${heapPressure}% of its heap. It is close to running out of memory and can start refusing new work.`,
      impact:
        'Active sessions can drop. Health checks and page loads become unreliable, and in-progress saves may never complete.',
      nextStep:
        'Restart the API if people are blocked, then look for a memory leak or raise the process memory limit so this does not return immediately.',
    });
  } else if (heapPressure != null && heapPressure >= 85) {
    events.push({
      id: 'memory-high',
      label: 'High memory usage — performance degradation across FRIS',
      meta: formatCheckedAt(checkedAt),
      tone: 'warn',
      href: '/admin/system-check#health',
      detail: `The API process is using ${heapPressure}% of its heap. It is still serving requests, but it has little room left before it starts dropping them.`,
      impact:
        'Pages get slower first. If usage keeps climbing, logins and saves can fail without a database outage.',
      nextStep:
        'Watch heap on this health card. Plan a restart or a memory increase before it crosses 90%.',
    });
  }

  const failureLogs = [...registrationActivity]
    .filter(isFailureActivity)
    .sort((a, b) => parseTimestampMs(b.createdAt) - parseTimestampMs(a.createdAt))
    .slice(0, 4);

  for (const log of failureLogs) {
    const surface = inferAffectedSurface(log.action);
    const actionLabel = formatActivityAction(log.action);
    const actor = log.actorLabel?.trim() || log.actorType || 'A user';
    const reason = readFailureReason(log.metadata);
    events.push({
      id: `activity-${log.id}`,
      label: `${actionLabel} on ${surface}`,
      meta: `${formatCheckedAt(log.createdAt)} · ${actor}`,
      tone: 'warn',
      detail: reason
        ? `${actor} hit a failure during “${actionLabel}”. The activity log recorded this reason: ${reason}.`
        : `${actor} triggered “${actionLabel}”. The activity log marked it as a failure on ${surface}.`,
      impact: `${surface} may be incomplete for the people involved until this action is completed successfully.`,
      nextStep:
        'Confirm who ran the action and which station it belongs to, then retry it or correct the data that caused the failure.',
    });
  }

  if (events.length === 0) {
    events.push({
      id: 'system-stable',
      label: 'No active FRIS system interruptions detected',
      meta: `Last checked · ${formatCheckedAt(checkedAt)}`,
      tone: 'ok',
      detail:
        'Database, API liveness, response time, memory, and recent failure activity are all inside the healthy range for this check.',
      impact: 'Users can sign in and work in FRIS. No station or admin screen is blocked by a system event right now.',
      nextStep: 'No action is required. This line updates on the next health check if a new interruption appears.',
    });
  }

  const activeIssues = events.filter((event) => event.tone === 'error' || event.tone === 'warn').length;
  const status: SystemCheckStatusTone = events.some((event) => event.tone === 'error')
    ? 'error'
    : events.some((event) => event.tone === 'warn')
      ? 'warn'
      : 'ok';

  return {
    activeIssues,
    status,
    lastCheckedAt: checkedAt,
    details: [
      { label: 'Active issues', value: String(activeIssues) },
      { label: 'API liveness', value: healthFull?.livenessStatus === 'ok' ? 'OK' : 'Degraded' },
      {
        label: 'Database',
        value: dbHealthy ? 'Online' : formatDatabaseStatusLabel(health.databaseStatus),
      },
      { label: 'Ready ping', value: latency > 0 ? `${latency} ms` : 'Unavailable' },
    ],
    insights: events.slice(0, 6),
  };
}

function parseTimestampMs(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export type SystemCheckTilePatch = Pick<
  DashboardAdminTile,
  'value' | 'unit' | 'badges' | 'progress' | 'progressColor' | 'sub'
>;

export function getSystemCheckTilePatches(snapshot: AdminAnalyticsSnapshot): Record<SystemCheckTileKey, SystemCheckTilePatch> {
  const { health, healthFull, registrationActivity, openTicketList, closedTicketList } = snapshot;
  const audit = computeAuditStats(registrationActivity);
  const incidents = computeIncidentStats(openTicketList, closedTicketList);
  const systemDowntime = computeSystemDowntime(snapshot);
  const dbHealthy = health.databaseStatus === 'online';
  const heapPressure = healthFull?.process?.heapPressurePct ?? null;
  const memoryHealthy = heapPressure == null || heapPressure < 85;

  const healthBadges: DashboardTileBadge[] = [];
  if (healthFull?.livenessStatus === 'ok') {
    healthBadges.push({ tone: 'emerald', label: 'API alive' });
  } else {
    healthBadges.push({ tone: 'amber', label: 'Liveness degraded' });
  }
  if (memoryHealthy) {
    healthBadges.push({ tone: 'teal', label: 'Memory stable' });
  } else {
    healthBadges.push({ tone: 'red', label: 'High memory' });
  }

  const auditBadges: DashboardTileBadge[] = [
    { tone: 'emerald', label: `${audit.creates} creates` },
    { tone: 'teal', label: `${audit.updates} updates` },
  ];
  if (audit.deletes > 0) {
    auditBadges.push({ tone: 'amber', label: `${audit.deletes} deletes` });
  }
  if (audit.rejections > 0) {
    auditBadges.push({ tone: 'amber', label: `${audit.rejections} rejected` });
  }
  if (audit.others > 0) {
    auditBadges.push({ tone: 'gray', label: `${audit.others} other` });
  }

  const incidentBadges: DashboardTileBadge[] = [];
  if (incidents.critical > 0) {
    incidentBadges.push({ tone: 'red', label: `${incidents.critical} critical` });
  }
  if (incidents.minor > 0) {
    incidentBadges.push({ tone: 'amber', label: `${incidents.minor} minor` });
  }
  if (incidents.open === 0) {
    incidentBadges.push({ tone: 'emerald', label: 'Queue clear' });
  }

  const apiLatency =
    health.databaseLatencyMs != null ? `${health.databaseLatencyMs}ms` : '—';
  const apiHealthy =
    health.databaseStatus === 'online' &&
    (health.databaseLatencyMs ?? 999) < API_GATEWAY_SLA_TARGET_MS;

  return {
    health: {
      sub: 'Runtime · Memory · API liveness',
      value: healthFull?.process?.uptimeHuman ?? health.serverUptimeHuman ?? '—',
      unit: 'server uptime',
      progress: heapPressure ?? (dbHealthy ? 72 : 28),
      progressColor: memoryHealthy ? 'emerald' : 'amber',
      badges: healthBadges,
    },
    audit: {
      sub: 'Registration & onboarding audit trail',
      value: String(auditBreakdownTotal(audit)),
      unit: 'events today',
      badges: auditBadges,
    },
    database: {
      sub: 'MongoDB readiness · Ping',
      value: dbHealthy ? 'Healthy' : formatDatabaseStatusLabel(health.databaseStatus),
      progress: dbHealthy ? Math.max(12, 100 - (health.databaseLatencyMs ?? 0) / 10) : 8,
      progressColor: dbHealthy ? 'emerald' : 'red',
      badges: [
        {
          tone: dbHealthy ? 'emerald' : 'red',
          label: healthFull?.mongoStatus === 'up' ? 'Mongo up' : 'Mongo check failed',
        },
      ],
    },
    api: {
      sub: 'Health probes · Throttling policy',
      value: apiLatency,
      unit: 'ready ping',
      badges: [
        {
          tone: apiHealthy ? 'emerald' : 'amber',
          label: apiHealthy ? 'Within SLA' : 'Elevated latency',
        },
      ],
    },
    incidents: {
      sub: 'Open support tickets · Severity',
      value: String(incidents.open),
      unit: 'open',
      badges: incidentBadges,
    },
    backup: {
      sub: 'Data export · Atlas backups',
      value: 'Export',
      unit: 'operational backup',
      badges: [{ tone: 'teal', label: 'Admin export ready' }],
    },
    downtime: {
      sub: 'FRIS outages · API & page failures',
      value: String(systemDowntime.activeIssues),
      unit: 'active',
      badges: [
        systemDowntime.activeIssues === 0
          ? { tone: 'emerald', label: 'All systems up' }
          : {
              tone: systemDowntime.status === 'error' ? 'red' : 'amber',
              label: `${systemDowntime.activeIssues} system issue${systemDowntime.activeIssues === 1 ? '' : 's'}`,
            },
      ],
    },
  };
}

function moduleStatusFromTone(tone: SystemCheckStatusTone): string {
  if (tone === 'ok') return 'Healthy';
  if (tone === 'warn') return 'Attention';
  if (tone === 'error') return 'Action required';
  return 'Monitoring';
}

export function mergeSystemCheckSections(
  snapshot: AdminAnalyticsSnapshot,
  tiles: DashboardAdminTile[],
): SystemCheckSection[] {
  const patches = getSystemCheckTilePatches(snapshot);
  const audit = computeAuditStats(snapshot.registrationActivity);
  const incidents = computeIncidentStats(snapshot.openTicketList, snapshot.closedTicketList);
  const systemDowntime = computeSystemDowntime(snapshot);
  const { health, healthFull } = snapshot;
  const dbHealthy = health.databaseStatus === 'online';
  const heapPressure = healthFull?.process?.heapPressurePct;

  const sectionMeta: Array<{
    key: SystemCheckTileKey;
    status: SystemCheckStatusTone;
    details: SystemCheckDetailRow[];
    insights: SystemCheckInsight[];
    action?: { label: string; href: string };
  }> = [
    {
      key: 'health',
      status:
        !dbHealthy || healthFull?.livenessStatus !== 'ok'
          ? 'warn'
          : heapPressure != null && heapPressure >= 85
            ? 'warn'
            : 'ok',
      details: [
        { label: 'Server uptime', value: healthFull?.process?.uptimeHuman ?? health.serverUptimeHuman ?? 'Unavailable' },
        { label: 'Liveness', value: healthFull?.livenessStatus === 'ok' ? 'OK' : 'Degraded' },
        {
          label: 'Heap memory',
          value:
            healthFull?.process != null
              ? `${healthFull.process.heapUsedHuman} / ${healthFull.process.heapTotalHuman}`
              : 'Unavailable',
        },
        {
          label: 'Heap pressure',
          value: heapPressure != null ? `${heapPressure}%` : 'Unavailable',
        },
        { label: 'RSS memory', value: healthFull?.process?.rssHuman ?? 'Unavailable' },
        { label: 'Node version', value: healthFull?.process?.nodeVersion ?? 'Unavailable' },
      ],
      insights: [
        {
          id: 'health-liveness',
          label: healthFull?.livenessStatus === 'ok' ? 'API process is live' : 'API liveness check degraded',
          meta: 'From GET /health',
          tone: healthFull?.livenessStatus === 'ok' ? 'ok' : 'warn',
        },
        {
          id: 'health-memory',
          label:
            heapPressure != null
              ? `Heap pressure at ${heapPressure}%`
              : 'Memory diagnostics unavailable',
          meta: healthFull?.process
            ? `${healthFull.process.heapUsedHuman} used of ${healthFull.process.heapTotalHuman}`
            : 'Enable /health/full on the API',
          tone: heapPressure != null && heapPressure >= 85 ? 'warn' : 'neutral',
        },
      ],
    },
    {
      key: 'audit',
      status: resolveAuditStatus(audit, snapshot.onboarding.queueTotal),
      details: [
        { label: 'Events today', value: String(audit.eventsToday) },
        { label: 'Creates', value: String(audit.creates) },
        { label: 'Updates', value: String(audit.updates) },
        { label: 'Deletes', value: String(audit.deletes) },
        { label: 'Rejections', value: String(audit.rejections) },
        { label: 'Failures today', value: String(audit.failuresToday) },
        { label: 'Pending reviews', value: String(snapshot.onboarding.queueTotal) },
        {
          label: 'Last event',
          value: audit.lastEventAt ? formatRelativeTime(audit.lastEventAt) : 'None today',
        },
      ],
      insights: audit.recent.map((log) => ({
        id: log.id,
        label: formatActivityAction(log.action),
        meta: `${log.actorLabel ?? log.actorType} · ${inferAffectedSurface(log.action)} · ${formatRelativeTime(log.createdAt)}`,
        href: log.userId ? `/admin/user/edit/${encodeURIComponent(log.userId)}` : undefined,
        tone: insightToneForAuditLog(log),
      })),
      action: { label: 'Export activity logs', href: '/admin/export' },
    },
    {
      key: 'database',
      status: dbHealthy ? 'ok' : health.databaseStatus === 'unknown' ? 'warn' : 'error',
      details: [
        { label: 'Status', value: dbHealthy ? 'Healthy' : formatDatabaseStatusLabel(health.databaseStatus) },
        { label: 'Mongo ping', value: healthFull?.mongoStatus === 'up' ? 'Up' : healthFull?.mongoStatus === 'down' ? 'Down' : 'Unknown' },
        { label: 'Ping latency', value: health.databaseLatencyMs != null ? `${health.databaseLatencyMs} ms` : 'Unavailable' },
        { label: 'Process PID', value: healthFull?.process?.pid ? String(healthFull.process.pid) : '—' },
      ],
      insights: [
        {
          id: 'db-readiness',
          label: dbHealthy ? 'Database accepting traffic' : 'Database readiness check failed',
          meta: 'From GET /ready',
          tone: dbHealthy ? 'ok' : 'error',
        },
      ],
      action: { label: 'Manage stations data', href: '/admin/stations' },
    },
    {
      key: 'api',
      status:
        health.databaseStatus !== 'online'
          ? 'error'
          : (health.databaseLatencyMs ?? 999) < API_GATEWAY_SLA_TARGET_MS
            ? 'ok'
            : (health.databaseLatencyMs ?? 999) < 500
              ? 'warn'
              : 'error',
      details: [
        {
          label: 'Liveness',
          value: healthFull?.livenessStatus === 'ok' ? 'OK' : 'Degraded',
        },
        { label: 'Liveness route', value: 'GET /health' },
        {
          label: 'Readiness',
          value: health.databaseStatus === 'online' ? 'OK' : formatDatabaseStatusLabel(health.databaseStatus),
        },
        { label: 'Readiness route', value: 'GET /ready' },
        {
          label: 'Ready ping',
          value: health.databaseLatencyMs != null ? `${health.databaseLatencyMs} ms` : 'Unavailable',
        },
        {
          label: 'Response SLA',
          value:
            health.databaseLatencyMs == null
              ? 'Unavailable'
              : (health.databaseLatencyMs ?? 999) < API_GATEWAY_SLA_TARGET_MS
                ? `Within ${API_GATEWAY_SLA_TARGET_MS} ms target`
                : `${health.databaseLatencyMs} ms · above target`,
        },
        {
          label: 'Datastore',
          value: dbHealthy ? 'MongoDB connected' : 'MongoDB unavailable',
        },
      ],
      insights: [],
      action: { label: 'View open tickets', href: '/admin/tickets' },
    },
    {
      key: 'incidents',
      status: incidents.critical > 0 ? 'error' : incidents.open > 0 ? 'warn' : 'ok',
      details: [
        { label: 'Open tickets', value: String(incidents.open) },
        { label: 'Critical / urgent', value: String(incidents.critical) },
        { label: 'Minor', value: String(incidents.minor) },
        { label: 'Resolved total', value: String(incidents.closed) },
        { label: 'Last resolved', value: incidents.lastResolvedLabel },
      ],
      insights: incidents.openTickets.map((ticket) => ({
        id: ticket.ticketNumber,
        label: `${ticket.ticketNumber} · ${ticket.issueType}`,
        meta: `${ticket.urgency} · ${ticket.navigationPageLabel} · ${formatRelativeTime(ticket.raisedAt)}`,
        href: `/admin/tickets?ticket=${encodeURIComponent(ticket.ticketNumber)}`,
        tone: isCriticalTicket(ticket) ? 'error' : 'warn',
      })),
      action: { label: 'Manage tickets', href: '/admin/tickets' },
    },
    {
      key: 'backup',
      status: 'neutral',
      details: [
        { label: 'Database backups', value: 'MongoDB Atlas (managed)' },
        { label: 'Operational export', value: 'Available' },
        { label: 'Export datasets', value: 'Users, stations, tickets, activity' },
        { label: 'Aggregate rollback', value: 'Server CLI scripts' },
        { label: 'Recovery test', value: 'Run via export + restore drills' },
      ],
      insights: [],
      action: { label: 'Open export data', href: '/admin/export' },
    },
    {
      key: 'downtime',
      status: systemDowntime.status,
      details: systemDowntime.details,
      insights: [],
    },
  ];

  const uptimeHuman = healthFull?.process?.uptimeHuman ?? health.serverUptimeHuman ?? '—';
  const uptimeSeconds = healthFull?.process?.uptimeSeconds ?? healthFull?.serverUptimeSeconds;
  const livenessOk = healthFull?.livenessStatus === 'ok';

  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile] as const));

  return sectionMeta
    .filter((section) => tileByKey.has(section.key))
    .map((section) => {
    const tile = tileByKey.get(section.key)!;
    const patch = patches[section.key];
    return {
      ...tile,
      ...patch,
      details: section.details,
      status: section.status,
      statusLabel: moduleStatusFromTone(section.status),
      insights: section.insights,
      action: section.action,
      ...(section.key === 'health'
        ? {
            uptimeLive: {
              human: uptimeHuman,
              seconds: uptimeSeconds,
              anchorIso: health.checkedAt,
              isLive: livenessOk && uptimeHuman !== '—',
            } satisfies SystemCheckUptimeLive,
            systemEvents: systemDowntime.insights,
          }
        : {}),
    };
  });
}

export function countHealthyModules(sections: SystemCheckSection[]) {
  return sections.filter((section) => section.status === 'ok').length;
}

export type SystemCheckOverview = {
  healthyCount: number;
  totalModules: number;
  healthScorePct: number;
  statusCounts: Record<SystemCheckStatusTone, number>;
  highlights: Array<{ id: string; label: string; value: string; tone: SystemCheckStatusTone }>;
  lastCheckedAt: string;
};

function scoreFromStatus(status: SystemCheckStatusTone) {
  if (status === 'ok') return 100;
  if (status === 'neutral') return 85;
  if (status === 'warn') return 55;
  return 20;
}

export function buildSystemCheckOverview(
  snapshot: AdminAnalyticsSnapshot,
  sections: SystemCheckSection[],
): SystemCheckOverview {
  const healthyCount = countHealthyModules(sections);
  const totalModules = sections.length || 1;
  const statusCounts: Record<SystemCheckStatusTone, number> = {
    ok: 0,
    warn: 0,
    error: 0,
    neutral: 0,
  };
  for (const section of sections) {
    statusCounts[section.status] += 1;
  }

  const healthScorePct =
    sections.length === 0
      ? 0
      : Math.round(
          sections.reduce((sum, section) => sum + scoreFromStatus(section.status), 0) /
            sections.length,
        );

  const audit = computeAuditStats(snapshot.registrationActivity);
  const systemDowntime = computeSystemDowntime(snapshot);

  const highlights = [
    {
      id: 'db-latency',
      label: 'DB ping',
      value:
        snapshot.health.databaseLatencyMs != null
          ? `${snapshot.health.databaseLatencyMs} ms`
          : '—',
      tone: (snapshot.health.databaseStatus === 'online' &&
      (snapshot.health.databaseLatencyMs ?? 999) < 300
        ? 'ok'
        : snapshot.health.databaseStatus === 'online'
          ? 'warn'
          : 'error') as SystemCheckStatusTone,
    },
    {
      id: 'downtime',
      label: 'System downtime',
      value: String(systemDowntime.activeIssues),
      tone: systemDowntime.status,
    },
    {
      id: 'audit-today',
      label: 'Audit today',
      value: String(audit.eventsToday),
      tone: resolveAuditStatus(audit, snapshot.onboarding.queueTotal),
    },
  ];

  return {
    healthyCount,
    totalModules,
    healthScorePct,
    statusCounts,
    highlights,
    lastCheckedAt: snapshot.health.checkedAt,
  };
}

export type MonitoringKpi = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  tone: SystemCheckStatusTone;
  trend: 'up' | 'down' | 'flat';
  trendLabel: string;
  tooltip: string;
  sparkline: number[];
};

const MODULE_PRIORITY: SystemCheckTileKey[] = [
  'health',
  'downtime',
  'database',
  'api',
  'audit',
  'backup',
];

export function generateSparklineValues(base: number, seed: string, points = 14): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const values: number[] = [];
  let current = Math.max(base * 0.82, 1);
  for (let i = 0; i < points; i += 1) {
    hash = (hash * 1664525 + 1013904223 + i) | 0;
    current = Math.max(0, current + ((hash % 100) / 100 - 0.5) * base * 0.14 + (base - current) * 0.1);
    values.push(Math.round(current * 10) / 10);
  }
  values[values.length - 1] = base;
  return values;
}

export function getSystemEnvironmentLabel() {
  const env =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_ENV) ||
    (typeof process !== 'undefined' && process.env.NODE_ENV) ||
    'production';
  const n = String(env).toLowerCase();
  if (n.includes('stag')) return 'Staging';
  if (n.includes('dev') || n.includes('local')) return 'Development';
  return 'Production';
}

export type OperationalStatus = 'operational' | 'degraded' | 'outage';

export function resolveOperationalStatus(overview: SystemCheckOverview): OperationalStatus {
  if (overview.statusCounts.error > 0) return 'outage';
  if (overview.statusCounts.warn > 0) return 'degraded';
  return 'operational';
}

export function buildMonitoringKpis(
  snapshot: AdminAnalyticsSnapshot,
  overview: SystemCheckOverview,
): MonitoringKpi[] {
  const audit = computeAuditStats(snapshot.registrationActivity);
  const systemDowntime = computeSystemDowntime(snapshot);
  const latency = snapshot.health.databaseLatencyMs ?? 0;

  return [
    {
      id: 'health-score',
      label: 'Health score',
      value: String(overview.healthScorePct),
      unit: '%',
      tone: overview.healthScorePct >= 80 ? 'ok' : overview.healthScorePct >= 55 ? 'warn' : 'error',
      trend: overview.healthScorePct >= 75 ? 'up' : 'down',
      trendLabel: overview.healthScorePct >= 75 ? 'Stable' : 'Review',
      tooltip: 'Composite score across all monitored modules',
      sparkline: generateSparklineValues(overview.healthScorePct, 'health-score'),
    },
    {
      id: 'healthy-modules',
      label: 'Healthy modules',
      value: `${overview.healthyCount}/${overview.totalModules}`,
      tone: overview.healthyCount === overview.totalModules ? 'ok' : 'warn',
      trend: 'flat',
      trendLabel: `${overview.healthyCount} passing`,
      tooltip: 'Modules reporting healthy status',
      sparkline: generateSparklineValues(overview.healthyCount, 'healthy-modules'),
    },
    {
      id: 'api-latency',
      label: 'API response',
      value: latency > 0 ? String(latency) : '—',
      unit: latency > 0 ? 'ms' : undefined,
      tone:
        snapshot.health.databaseStatus === 'online' && latency < 300
          ? 'ok'
          : snapshot.health.databaseStatus === 'online'
            ? 'warn'
            : 'error',
      trend: latency > 0 && latency < 300 ? 'down' : 'up',
      trendLabel: latency > 0 ? (latency < 300 ? 'Within SLA' : 'Elevated') : 'N/A',
      tooltip: 'Readiness ping round-trip via GET /ready',
      sparkline: generateSparklineValues(Math.max(latency, 1), 'api-latency'),
    },
    {
      id: 'downtime',
      label: 'System issues',
      value: String(systemDowntime.activeIssues),
      tone: systemDowntime.status,
      trend: systemDowntime.activeIssues > 0 ? 'up' : 'flat',
      trendLabel:
        systemDowntime.activeIssues > 0
          ? `${systemDowntime.activeIssues} active`
          : 'Operational',
      tooltip: 'FRIS application outages, API failures, and degraded pages',
      sparkline: generateSparklineValues(systemDowntime.activeIssues, 'downtime'),
    },
    {
      id: 'audit',
      label: 'Audit activity',
      value: String(audit.eventsToday),
      tone: resolveAuditStatus(audit, snapshot.onboarding.queueTotal),
      trend: audit.eventsToday > 0 ? 'up' : 'flat',
      trendLabel:
        audit.failuresToday > 0
          ? `${audit.failuresToday} failure${audit.failuresToday === 1 ? '' : 's'}`
          : snapshot.onboarding.queueTotal > 0
            ? `${snapshot.onboarding.queueTotal} pending`
            : `${audit.eventsToday} today`,
      tooltip: 'Registration and onboarding events logged today',
      sparkline: generateSparklineValues(audit.eventsToday, 'audit'),
    },
  ];
}

export function orderSystemCheckSections(sections: SystemCheckSection[]): SystemCheckSection[] {
  const rank = new Map(MODULE_PRIORITY.map((k, i) => [k, i]));
  return [...sections].sort(
    (a, b) => (rank.get(a.key as SystemCheckTileKey) ?? 99) - (rank.get(b.key as SystemCheckTileKey) ?? 99),
  );
}

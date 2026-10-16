import { randomUUID } from 'crypto';
import type {
  AuditEventType,
  AuditModule,
  AuditResult,
  AuditSeverity,
} from '../constants/audit.enums';
import type { UserActivityLogEventPayload } from '../../user-activity-notifications/events/user-activity.events';
import { parseUserAgent } from './parse-user-agent.util';

function stripQuery(path: string): string {
  return String(path ?? '').split('?')[0] || '/';
}

export function inferAuditModule(
  method: string,
  path: string,
  action: string,
): AuditModule | string {
  const p = stripQuery(path).toLowerCase();
  const a = String(action ?? '').toLowerCase();

  if (
    p.includes('/auth') ||
    a.includes('signed in') ||
    a.includes('signed out') ||
    a.includes('password')
  ) {
    return 'Authentication';
  }
  if (
    p.includes('/admin/access-control') ||
    p.includes('/admins/panel') ||
    p.includes('/users/panel')
  ) {
    return 'Access Control';
  }
  if (p.includes('/admin-stations') || p.includes('/station'))
    return 'Station Management';
  if (p.includes('/admin-departments') || p.includes('/department'))
    return 'Station Management';
  if (
    p.includes('/user-registration') ||
    p.includes('/register') ||
    method === 'REGISTRATION'
  ) {
    return 'Registration';
  }
  if (p.includes('/reports') || p.includes('/export')) return 'Reports';
  if (p.includes('/notifications') || p.includes('/notification'))
    return 'Notifications';
  if (p.includes('/contract') || p.includes('/sgha')) return 'Contracts';
  if (p.includes('/equipment') || p.includes('/gse') || p.includes('/manpower'))
    return 'Equipment';
  if (p.includes('/dashboard')) return 'Dashboard';
  if (
    p.includes('/fhr') ||
    p.includes('/flight') ||
    p.includes('/ramp') ||
    p.includes('/manifest') ||
    p.includes('/load-control')
  ) {
    return 'Flight Operations';
  }
  return 'System';
}

export function inferAuditEventType(
  method: string,
  path: string,
  action: string,
): AuditEventType | string {
  const m = String(method ?? 'GET').toUpperCase();
  const p = stripQuery(path).toLowerCase();
  const a = String(action ?? '').toLowerCase();

  if (a.includes('signed in') || p.includes('/login')) return 'LOGIN';
  if (a.includes('signed out') || p.includes('/logout')) return 'LOGOUT';
  if (p.includes('/export') || a.includes('export')) return 'EXPORT';
  if (p.includes('/import') || a.includes('import')) return 'IMPORT';
  if (
    a.includes('role') ||
    a.includes('permission') ||
    p.includes('/permission')
  ) {
    return a.includes('assign') ? 'ASSIGN_ROLE' : 'PERMISSION_CHANGE';
  }
  if (m === 'POST') return 'CREATE';
  if (m === 'PUT' || m === 'PATCH' || m === 'REGISTRATION') return 'UPDATE';
  if (m === 'DELETE') return 'DELETE';
  return 'VIEW';
}

export function inferAuditSeverity(
  eventType: string,
  result: AuditResult,
  action: string,
): AuditSeverity {
  if (result === 'FAILED') return 'HIGH';
  const a = String(action ?? '').toLowerCase();
  if (
    eventType === 'DELETE' ||
    eventType === 'PERMISSION_CHANGE' ||
    eventType === 'ASSIGN_ROLE'
  ) {
    return 'MEDIUM';
  }
  if (eventType === 'LOGIN' || eventType === 'LOGOUT') return 'LOW';
  if (a.includes('failed') || a.includes('reject')) return 'HIGH';
  if (eventType === 'EXPORT' || eventType === 'IMPORT') return 'LOW';
  if (eventType === 'VIEW') return 'INFO';
  return 'INFO';
}

export function inferAuditResult(
  action: string,
  metadata?: Record<string, unknown>,
): AuditResult {
  const a = String(action ?? '').toLowerCase();
  if (
    a.includes('failed') ||
    a.includes('reject') ||
    metadata?.outcome === 'failed'
  ) {
    return 'FAILED';
  }
  if (a.includes('warn') || metadata?.outcome === 'warning') return 'WARNING';
  return 'SUCCESS';
}

export function computeRiskScore(
  severity: AuditSeverity,
  result: AuditResult,
  eventType: string,
): number {
  let score = 10;
  if (severity === 'LOW') score = 20;
  if (severity === 'MEDIUM') score = 45;
  if (severity === 'HIGH') score = 72;
  if (severity === 'CRITICAL') score = 92;
  if (result === 'FAILED') score = Math.min(100, score + 15);
  if (eventType === 'PERMISSION_CHANGE' || eventType === 'ASSIGN_ROLE') {
    score = Math.min(100, score + 10);
  }
  return score;
}

export function inferEntityType(
  module: string,
  path: string,
): string | undefined {
  const p = stripQuery(path).toLowerCase();
  if (p.includes('/users')) return 'User';
  if (p.includes('/admins')) return 'Admin';
  if (p.includes('/station')) return 'Station';
  if (p.includes('/department')) return 'Department';
  if (p.includes('/fhr') || p.includes('/flight')) return 'Flight';
  if (p.includes('/report')) return 'Report';
  if (p.includes('/contract')) return 'Contract';
  if (module === 'Registration') return 'Registration';
  return undefined;
}

export function buildAuditEventId(): string {
  return `AUD-${randomUUID()}`;
}

export function mapActivityToAuditRecord(
  payload: UserActivityLogEventPayload,
  enrich?: {
    employeeId?: string;
    role?: string;
    station?: string;
    department?: string;
    sourceLogId?: string;
    timestamp?: Date;
  },
) {
  const method = String(payload.method ?? 'GET');
  const path = String(payload.path ?? '');
  const actionLabel = String(payload.action ?? 'Performed action');
  const metadata = payload.metadata ?? {};
  const module =
    String(payload.module ?? '').trim() ||
    inferAuditModule(method, path, actionLabel);
  const eventType = inferAuditEventType(method, path, actionLabel);
  const result = inferAuditResult(actionLabel, metadata);
  const severity = inferAuditSeverity(eventType, result, actionLabel);
  const riskScore = computeRiskScore(severity, result, eventType);
  const { device, browser, os } = parseUserAgent(payload.userAgent);

  const entityId =
    String(
      payload.entityId ??
        metadata.userId ??
        metadata.employeeId ??
        metadata.stationId ??
        metadata.fhrNo ??
        '',
    ).trim() || undefined;

  return {
    eventId: buildAuditEventId(),
    sourceLogId: enrich?.sourceLogId,
    timestamp: enrich?.timestamp ?? new Date(),
    userId: payload.userId,
    employeeId:
      enrich?.employeeId ||
      String(metadata.employeeId ?? '').trim() ||
      undefined,
    userName: payload.userName,
    userEmail: payload.userEmail,
    role: payload.actorRole || enrich?.role,
    station:
      payload.stationName ||
      payload.stationId ||
      enrich?.station ||
      String(
        metadata.stationName ?? metadata.station ?? metadata.stationId ?? '',
      ).trim() ||
      undefined,
    department:
      enrich?.department ||
      String(metadata.department ?? '').trim() ||
      undefined,
    module,
    action: eventType,
    entityType:
      String(payload.entityType ?? '').trim() ||
      inferEntityType(String(module), path),
    entityId,
    before: metadata.before as Record<string, unknown> | undefined,
    after: metadata.after as Record<string, unknown> | undefined,
    severity,
    result,
    ipAddress: payload.ipAddress,
    requestId: payload.requestId,
    correlationId: payload.correlationId,
    device,
    browser,
    os,
    riskScore,
    metadata: {
      ...metadata,
      actionLabel,
      method,
      path,
      accountType: payload.accountType,
    },
    rawPayload: payload as unknown as Record<string, unknown>,
  };
}

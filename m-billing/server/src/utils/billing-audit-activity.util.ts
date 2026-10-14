import type { UserActivityLogEventPayload } from 'src/user-activity-notifications/events/user-activity.events';
import type { AuditLogInput } from '../engines/audit-engine.service';
import type { BillingActor } from '../services/billing-customers.service';

const ALLOWED_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  customer: new Set(['created', 'updated', 'cancelled']),
  service_catalog: new Set(['created', 'updated', 'cancelled']),
  contract: new Set(['created', 'updated', 'approved', 'cancelled']),
  rate_card: new Set(['created', 'updated', 'cancelled']),
  price_card_airline: new Set(['created', 'updated', 'cancelled']),
  settings: new Set(['updated']),
  tax_rule: new Set(['created', 'updated']),
  exchange_rate: new Set(['created', 'updated', 'deleted']),
  sequence: new Set(['created', 'updated']),
  // Deletes/creates are aggregated by BillingPreparationService; never bridge
  // a per-record preparation event for those bulk-capable operations.
  preparation: new Set(['updated', 'rejected']),
  invoice: new Set([
    'generated',
    'approved',
    'rejected',
    'posted',
    'cancelled',
    'email_sent',
  ]),
  credit_memo: new Set(['created', 'posted']),
  parallel_run: new Set(['created', 'approved']),
  cutover: new Set(['imported']),
  decommission: new Set(['posted']),
};

const ACTION_LABELS: Readonly<Record<string, string>> = {
  created: 'Created',
  updated: 'Updated',
  approved: 'Approved',
  rejected: 'Rejected',
  generated: 'Generated',
  posted: 'Posted',
  cancelled: 'Deleted',
  deleted: 'Deleted',
  imported: 'Imported',
  email_sent: 'Sent',
};

function title(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

/** Selected high-value billing mutations only. */
export function isBillingActivityAllowed(input: AuditLogInput): boolean {
  const entityType = String(input.entityType ?? '')
    .trim()
    .toLowerCase();
  const action = String(input.action ?? '')
    .trim()
    .toLowerCase();
  if (!ALLOWED_ACTIONS[entityType]?.has(action)) return false;

  const changes = input.changes ?? {};
  if (
    entityType === 'customer' &&
    action === 'updated' &&
    (changes.syncFromAdvanceAirline || changes.syncFromGatewayScheduledAirlines)
  ) {
    return false;
  }
  if (entityType === 'preparation' && action === 'updated') {
    return Boolean(changes.action || changes.status);
  }
  return true;
}

export function mapBillingAuditToActivity(
  input: AuditLogInput,
): UserActivityLogEventPayload | null {
  if (!isBillingActivityAllowed(input)) return null;

  const entityType = String(input.entityType).trim().toLowerCase();
  const action = String(input.action).trim().toLowerCase();
  const entityName = title(entityType);
  const actor = input.actor;
  const actionLabel = `${ACTION_LABELS[action] ?? title(action)} ${entityName}`;

  return {
    userId: actor?.userId ?? input.userId,
    userName: actor?.userName ?? input.userName,
    userEmail: actor?.userEmail,
    accountType: actor?.accountType === 'admin' ? 'admin' : 'user',
    actorRole: actor?.role,
    action: actionLabel,
    summary: `${actor?.userName ?? input.userName} — ${actionLabel}.`,
    stationId: actor?.stationId,
    stationName: actor?.stationName ?? actor?.stationCode ?? input.stationCode,
    module: 'Billing',
    page: entityName,
    entityType,
    entityId: String(input.entityId),
    entityName,
    changes: Object.entries(input.changes ?? {}).map(([field, newValue]) => ({
      field,
      newValue,
    })),
    method:
      action === 'created' || action === 'generated' || action === 'posted'
        ? 'POST'
        : action === 'cancelled' || action === 'deleted'
          ? 'DELETE'
          : 'PATCH',
    path: `/billing/${entityType.replace(/_/g, '-')}`,
    metadata: {
      ...(input.changes ?? {}),
      billingAction: action,
      loginId: actor?.loginId,
      stationCode: input.stationCode,
    },
    ipAddress: actor?.ipAddress ?? input.ipAddress,
    userAgent: actor?.userAgent,
    requestId: actor?.requestId,
    correlationId: actor?.correlationId,
  };
}

type PreparationSnapshotSource = {
  _id?: unknown;
  sourceRef?: Record<string, unknown>;
  customerCode?: unknown;
  customerName?: unknown;
  sourceType?: unknown;
  status?: unknown;
  operationalSnapshot?: Record<string, unknown>;
};

export type PreparationActivitySample = {
  id?: string;
  serial?: string;
  airlineCustomer?: string;
  flightNumber?: string;
  flightDateTime?: string;
  route?: string;
  sourceType?: string;
  priorStatus?: string;
};

/** Stable, bounded preparation snapshot used by aggregate activity records. */
export function preparationActivitySample(
  row: PreparationSnapshotSource,
): PreparationActivitySample {
  const sourceRef = row.sourceRef ?? {};
  const snapshot = row.operationalSnapshot ?? {};
  const first = (...values: unknown[]) =>
    values.map((value) => String(value ?? '').trim()).find(Boolean) ||
    undefined;

  return {
    id: first(row._id),
    serial: first(sourceRef.serialNo, snapshot.serialNumber, snapshot.serialNo),
    airlineCustomer: first(
      row.customerName,
      row.customerCode,
      snapshot.customerName,
      snapshot.customerCode,
      snapshot.airlineCode,
    ),
    flightNumber: first(
      sourceRef.flightNo,
      snapshot.flightNo,
      snapshot.flightNoEquipmentNo,
    ),
    flightDateTime: first(
      snapshot.atdDate,
      snapshot.ataDate,
      snapshot.staDate,
      snapshot.billingDateYmd,
    ),
    route: first(snapshot.route, snapshot.sector, snapshot.flightRoute),
    sourceType: first(row.sourceType),
    priorStatus: first(row.status),
  };
}

export function preparationActivityTab(
  rows: PreparationSnapshotSource[],
): string {
  const statuses = new Set(
    rows
      .map((row) => preparationActivitySample(row).priorStatus)
      .filter((status): status is string => Boolean(status)),
  );
  if (statuses.has('validation_error')) return 'Validation Error';
  if (statuses.size !== 1) return 'All';
  const [status] = statuses;
  return title(status);
}

function breakdown(
  rows: PreparationSnapshotSource[],
  value: (row: PreparationActivitySample) => string | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = value(preparationActivitySample(row));
    if (key) result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function buildPreparationAggregateMetadata(input: {
  affected: PreparationSnapshotSource[];
  failures?: Array<Record<string, unknown>>;
  counts: {
    requested: number;
    created?: number;
    deleted?: number;
    skipped: number;
    failed: number;
  };
  page: string;
  tab: string;
  scope: Record<string, unknown>;
  statusBreakdown?: Record<string, number>;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const failures = input.failures ?? [];
  const affectedFlights = input.affected
    .slice(0, 25)
    .map(preparationActivitySample);
  return {
    outcome:
      input.counts.skipped > 0 || input.counts.failed > 0
        ? 'partial'
        : 'success',
    counts: input.counts,
    affectedFlights,
    affectedFlightCount: affectedFlights.length,
    remainingAffectedCount: Math.max(
      0,
      input.affected.length - affectedFlights.length,
    ),
    failures: failures.slice(0, 25),
    remainingFailureCount: Math.max(0, failures.length - 25),
    page: input.page,
    tab: input.tab,
    sourceBreakdown: breakdown(input.affected, (row) => row.sourceType),
    customerBreakdown: breakdown(
      input.affected,
      (row) => row.airlineCustomer,
    ),
    statusBreakdown:
      input.statusBreakdown ??
      breakdown(input.affected, (row) => row.priorStatus),
    scope: input.scope,
    ...(input.extra ?? {}),
  };
}

export function buildPreparationAggregateActivity(input: {
  actor: BillingActor;
  action: string;
  summary: string;
  stationCode: string;
  metadata: Record<string, unknown>;
  method?: string;
  path?: string;
  page?: string;
  tab?: string;
}): UserActivityLogEventPayload {
  const {
    actor,
    action,
    summary,
    stationCode,
    metadata,
    method,
    path,
    page,
    tab,
  } = input;
  return {
    userId: actor.userId,
    userName: actor.userName,
    userEmail: actor.userEmail,
    accountType: actor.accountType === 'admin' ? 'admin' : 'user',
    actorRole: actor.role,
    action,
    summary,
    stationId: actor.stationId,
    stationName: actor.stationName ?? actor.stationCode ?? stationCode,
    module: 'Billing',
    page: page ?? 'Preparation',
    tab,
    entityType: 'preparation_batch',
    method: method ?? 'POST',
    path: path ?? '/billing/preparation',
    metadata: {
      ...metadata,
      loginId: actor.loginId,
      stationCode,
    },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    requestId: actor.requestId,
    correlationId: actor.correlationId,
  };
}

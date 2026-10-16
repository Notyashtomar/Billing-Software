export const USER_ACTIVITY_LOG_EVENT = 'user.activity.log';

/** A single field-level change for an audit entry. */
export type AuditFieldChange = {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export type UserActivityLogEventPayload = {
  userId: string;
  userName: string;
  userEmail?: string;
  accountType: 'admin' | 'user';
  action: string;
  /** Self-explanatory description of exactly what happened. */
  summary?: string;
  actorRole?: string;
  /** Station context the action belongs to. */
  stationId?: string;
  stationName?: string;
  /** Human-readable location in the app. */
  module?: string;
  page?: string;
  tab?: string;
  section?: string;
  /** The record that was acted upon (e.g. the affected user). */
  entityType?: string;
  entityId?: string;
  entityName?: string;
  /** Field-level diff with old/new values. */
  changes?: AuditFieldChange[];
  method?: string;
  path?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  /**
   * When false, recording a `user` activity will NOT bump that user's
   * `lastActivityAt`. Used for admin-initiated changes ABOUT a user (e.g. an
   * admin editing the user's permissions) so the target is not shown as
   * "recently active" just because someone modified their account.
   */
  bumpLastActivity?: boolean;
};

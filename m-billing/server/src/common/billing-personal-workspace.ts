import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ userId: string }>();

export const billingPersonalWorkspace = {
  run<T>(userId: string, fn: () => T): T {
    const id = userId.trim();
    if (!id) return fn();
    return storage.run({ userId: id }, fn);
  },
};

/** Logged-in billing user for this request. Empty outside an HTTP billing call. */
export function currentBillingOwnerUserId(): string {
  return String(storage.getStore()?.userId ?? '').trim();
}

/**
 * In-progress preparation belongs to the user who sent it.
 * Rows saved before owner tracking (no ownerUserId) stay visible so existing work is not dropped.
 */
export function preparationVisibilityClause(
  userId: string,
): Record<string, unknown> | null {
  const id = userId.trim();
  if (!id) return null;
  return {
    $or: [{ ownerUserId: id }, { ownerUserId: null }, { ownerUserId: '' }],
  };
}

/**
 * Sent-to-preparation marker.
 * Another user's open rows are hidden. A flight already on a shared invoice or draft
 * still counts as sent so it is not billed twice.
 */
export function preparationSentMarkerClause(
  userId: string,
): Record<string, unknown> | null {
  const visible = preparationVisibilityClause(userId);
  if (!visible) return null;
  return {
    $or: [
      ...(visible.$or as Record<string, unknown>[]),
      { status: 'invoiced' },
      { invoiceDraftId: { $type: 'objectId' } },
      { invoiceId: { $type: 'objectId' } },
    ],
  };
}

export function andPreparationClause<T extends Record<string, unknown>>(
  filter: T,
  clause: Record<string, unknown> | null,
): T {
  if (!clause) return filter;
  return { $and: [filter, clause] } as unknown as T;
}

export function withPreparationVisibility<T extends Record<string, unknown>>(
  filter: T,
): T {
  return andPreparationClause(
    filter,
    preparationVisibilityClause(currentBillingOwnerUserId()),
  );
}

export function withPreparationSentMarker<T extends Record<string, unknown>>(
  filter: T,
): T {
  return andPreparationClause(
    filter,
    preparationSentMarkerClause(currentBillingOwnerUserId()),
  );
}

export function preparationRowVisibleToCurrentUser(ownerUserId: unknown): boolean {
  const me = currentBillingOwnerUserId();
  if (!me) return true;
  const owner = String(ownerUserId ?? '').trim();
  return !owner || owner === me;
}

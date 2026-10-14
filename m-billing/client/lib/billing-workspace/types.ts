/** Stable identity for a personal Billing UI workspace. */
export type BillingWorkspaceIdentity = {
  userId: string;
  stationCode: string;
};

/**
 * Per-route UI slices. Phase 1 keeps the bag empty; Phase 2+ pages migrate
 * durable filters/selection here without changing API workflows.
 */
export type BillingWorkspacePages = Record<string, unknown>;

export type BillingWorkspaceState = {
  identity: BillingWorkspaceIdentity | null;
  pages: BillingWorkspacePages;
};

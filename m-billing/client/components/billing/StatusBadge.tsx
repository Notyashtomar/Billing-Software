import { billingUi } from './billingUi';

const STYLES: Record<string, string> = {
  draft: billingUi.badgeNeutral,
  pending: billingUi.badgeWarning,
  pending_approval: billingUi.badgeWarning,
  approved: billingUi.badgeInfo,
  generated: billingUi.badgeInfo,
  posted: billingUi.badgeSuccess,
  active: billingUi.badgeSuccess,
  cancelled: billingUi.badgeDanger,
  expired: billingUi.badgeDanger,
  validation_error: billingUi.badgeDanger,
  ready_for_invoice: billingUi.badgeSuccess,
  eligible: billingUi.badgeInfo,
  rejected: billingUi.badgeNeutral,
  invited: billingUi.badgeWarning,
  in_progress: billingUi.badgeInfo,
  submitted: billingUi.badgeWarning,
  under_review: billingUi.badgeAccent,
  invoiced: billingUi.badgeInfo,
  fris_primary: billingUi.badgeInfo,
  bc_readonly: billingUi.badgeWarning,
  decommissioned: billingUi.badgeNeutral,
  parallel: billingUi.badgeAccent,
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? billingUi.badgeNeutral;
  const label = status.replace(/_/g, ' ');
  return (
    <span className={cls} aria-label={`Status: ${label}`}>
      {label}
    </span>
  );
}

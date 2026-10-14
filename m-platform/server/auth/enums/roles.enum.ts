export enum Role {
  SUPER_ADMIN = 'superadmin',
  /** Elevated account. Legacy `admin` and `operations` values canonicalize to this. */
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
}

/** Admin-panel and elevated JWT roles. */
export const ADMIN_ROLES = [Role.SUPER_ADMIN, Role.MANAGER] as const;

/** User-management APIs that must not be exposed to panel manager accounts. */
export const SUPER_ADMIN_PANEL_ROLES = [Role.SUPER_ADMIN] as const;

/** FRIS panel authorization roles (superadmin, manager, employee). */
export const FRIS_PANEL_ROLES = [
  Role.SUPER_ADMIN,
  Role.MANAGER,
  Role.EMPLOYEE,
] as const;
export const OPERATIONAL_ROLES = [Role.SUPER_ADMIN, Role.MANAGER] as const;

/**
 * Read-only report viewing (FHR / GSE / Team / equipment flight reports).
 *
 * These endpoints only return already-generated report data, so they are open
 * to every authenticated account type. Whether a user can actually reach the
 * report is governed by the per-page permission flags (e.g. the "FHR Report"
 * sub-page toggle) enforced on the frontend — NOT by the FRIS role hierarchy.
 * This lets admin-created panel users (role `employee`) who have been granted
 * FHR access view the generated report. Mutations for Scheduled Airlines FHR
 * data / signatures are gated by page permission (`FrisPagePermission`), so
 * duty managers (`manager`) and employees with that page can save.
 */
export const REPORT_VIEW_ROLES = [
  Role.SUPER_ADMIN,
  Role.MANAGER,
  Role.EMPLOYEE,
] as const;

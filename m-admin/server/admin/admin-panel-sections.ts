/**
 * Canonical list of admin-panel sections that can be granted to an admin /
 * superadmin account. Mirrors the client `AdminPanelSection` union in
 * `client/lib/admin-nav-config.ts`. Keep both lists in sync.
 */
export const ADMIN_PANEL_SECTION_KEYS = [
  'dashboard',
  'users',
  'user-credentials',
  'departments',
  'stations',
  'training',
  'tickets',
  'notifications',
  'user-activity',
  'system-check',
  'export',
] as const;

export type AdminPanelSectionKey = (typeof ADMIN_PANEL_SECTION_KEYS)[number];

const SECTION_KEY_SET = new Set<string>(ADMIN_PANEL_SECTION_KEYS);

/**
 * Sanitize an incoming admin-panel section list:
 * - `undefined` stays `undefined` (legacy/unrestricted access).
 * - Unknown keys are dropped and duplicates removed.
 * - The result preserves the canonical section ordering.
 */
export function sanitizeAdminPanelSections(
  input: string[] | undefined | null,
): string[] | undefined {
  if (input == null) return undefined;
  if (!Array.isArray(input)) return undefined;
  const provided = new Set(
    input
      .map((value) => String(value ?? '').trim())
      .filter((value) => SECTION_KEY_SET.has(value)),
  );
  return ADMIN_PANEL_SECTION_KEYS.filter((key) => provided.has(key));
}

import type { UserFlags } from '../../user/schema/user.schema';

/** Advance page tab ids (mirrors client AdvanceScreen + nav-permissions). */
export const FRIS_ADVANCE_TAB_IDS = new Set([
  'gateway',
  'schedule',
  'schedule-equipment',
  'cargo',
  'gh-representative',
  'invoicing',
  'alert',
]);

export const FRIS_ADVANCE_TAB_PERMISSION: Record<string, string> = {
  gateway: 'Gateway',
  schedule: 'Schedule Setup',
  'schedule-equipment': 'Schedule Equipment Setup',
  cargo: 'Cargo',
  'gh-representative': 'GH Representative',
  invoicing: 'Invoicing',
  alert: 'Alert Setup',
};

export const FRIS_CREATION_SECTION_IDS = new Set([
  'scheduled-airlines',
  'additional-flights',
  'raf',
]);

export const FRIS_CREATION_SECTION_PERMISSION: Record<string, string> = {
  'scheduled-airlines': 'Scheduled Airlines',
  'additional-flights': 'Additional Flights',
  raf: 'RAF',
};

export function isFrisSubPageAllowed(
  flags: UserFlags | undefined,
  tabKey: string,
  pageLabel: string,
): boolean {
  if (!flags) return false;
  const tabFlags = flags[tabKey];
  if (!tabFlags || typeof tabFlags !== 'object') return false;
  const map = tabFlags as Record<string, number>;
  if (map[pageLabel] === 1) return true;
  if (pageLabel === 'Equipment' && map['Equipment Manpower'] === 1) return true;
  if (pageLabel === 'Manpower' && map['Equipment Manpower'] === 1) return true;
  return false;
}

export function resolveAdvanceTabRedirect(tab: string): string | null {
  if (!FRIS_ADVANCE_TAB_IDS.has(tab)) return null;
  return `/fris/advance?tab=${tab}`;
}

export function resolveCreationSectionRedirect(section: string): string | null {
  if (!FRIS_CREATION_SECTION_IDS.has(section)) return null;
  return `/fris/creation?section=${section}`;
}

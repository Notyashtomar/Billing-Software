/**
 * Shared helpers to overlay real employee designations onto equipment/manpower rows.
 * Source of truth: Advance → Gateway → Staff (`advance-staff`), then panel users.
 * Never use bare gateway manpower role labels like "Operator" as job title.
 */

import {
  fetchAdvanceGatewayStaff,
  fetchEmployeeDesignationLookup,
  resolveEmployeeDesignation,
} from '@/lib/api';

function isBareOperator(value?: string): boolean {
  return /^operator$/i.test(String(value ?? '').trim());
}

/** Build a complete employeeCode → designation map for forms and reports. */
export async function buildFullDesignationLookup(): Promise<Map<string, string>> {
  const [lookup, gatewayStaff] = await Promise.all([
    fetchEmployeeDesignationLookup(),
    fetchAdvanceGatewayStaff().catch(() => []),
  ]);

  for (const staff of gatewayStaff) {
    const code = staff.employeeCode.trim().toLowerCase();
    // Prefer resolved job title; else gateway manpower role (skip bare Operator).
    const fromManpower = !isBareOperator(staff.manpower)
      ? staff.manpower.trim()
      : '';
    const fromManpowerCode = !isBareOperator(staff.manpowerCode)
      ? staff.manpowerCode.trim()
      : '';
    const designation =
      staff.designation.trim() || fromManpower || fromManpowerCode;
    if (!code || !designation || isBareOperator(designation)) continue;
    if (!lookup.has(code)) lookup.set(code, designation);
  }

  return lookup;
}

/** True when designation is missing or the legacy Operator placeholder. */
function needsDesignationFallback(designation?: string): boolean {
  const saved = String(designation ?? '').trim();
  return !saved || isBareOperator(saved);
}

/**
 * Prefer Gateway Staff / panel master designation for the employee code.
 * When master misses, keep the stored row designation (never invent "Operator").
 */
export function applyDesignationLookupToRows<
  T extends { employeeId?: string; designation?: string },
>(rows: T[], lookup: Map<string, string>): T[] {
  if (!rows.length) return rows;
  if (lookup.size === 0) {
    return rows.map((row) => {
      if (!needsDesignationFallback(row.designation)) return row;
      if (isBareOperator(row.designation)) return { ...row, designation: '' };
      return row;
    });
  }
  return rows.map((row) => {
    const saved = String(row.designation ?? '').trim();
    const resolved = resolveEmployeeDesignation(
      row.employeeId,
      lookup,
      saved && !isBareOperator(saved) ? saved : undefined,
    );
    if (!resolved) {
      if (saved && isBareOperator(saved)) {
        return { ...row, designation: '' };
      }
      return row;
    }
    if (resolved === saved) return row;
    return { ...row, designation: resolved };
  });
}

export async function resolveDesignationsOnRows<
  T extends { employeeId?: string; designation?: string },
>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const needsLookup = rows.some(
    (row) =>
      String(row.employeeId ?? '').trim() ||
      needsDesignationFallback(row.designation),
  );
  if (!needsLookup) return rows;
  try {
    const lookup = await buildFullDesignationLookup();
    return applyDesignationLookupToRows(rows, lookup);
  } catch {
    // Soft-fail: still strip bare Operator so PDF does not show the placeholder.
    return rows.map((row) =>
      isBareOperator(row.designation) ? { ...row, designation: '' } : row,
    );
  }
}

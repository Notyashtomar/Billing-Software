/**
 * GH Representative combobox helpers for Main Details (scheduled + non-scheduled).
 */

import { advanceDocId } from '@/lib/api';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';

export type GhRepMasterRow = {
  id: string;
  employeeName: string;
  employeeCode: string;
  active: boolean;
};

/** Shown under Representatives — flight-form roles may pick GH / Airline reps. */
export const REPRESENTATIVES_ACCESS_NOTE =
  'Accessible by Employee, Manager, and Super Admin (Scheduled / Non-Scheduled Airlines). Advance → GH Representative is only needed to manage the GH Rep master list.';

export function mapGhRepMasterRow(
  doc: Record<string, unknown>,
): GhRepMasterRow | null {
  const d = advanceDocId(doc);
  const employeeName = String(d.employeeName ?? '').trim();
  const employeeCode = String(d.employeeCode ?? '').trim();
  if (!employeeName && !employeeCode) return null;
  return {
    id: d.id,
    employeeName,
    employeeCode,
    active: d.active !== false,
  };
}

/** Lightweight combobox options from Advance GH Rep master (no extra API). */
export function buildGhRepComboOptions(
  rows: GhRepMasterRow[],
): SearchableComboOption[] {
  return rows
    .filter((row) => row.active)
    .map((row) => ({
      id: row.id,
      label: row.employeeName || row.employeeCode,
      description: row.employeeCode
        ? `Employee code: ${row.employeeCode}`
        : undefined,
      searchIndex: `${row.employeeName} ${row.employeeCode}`.toLowerCase(),
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
    }));
}

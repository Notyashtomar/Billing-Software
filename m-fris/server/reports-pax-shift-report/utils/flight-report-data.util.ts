import type { PaxShiftEmployeeSectionBlock } from '../schema/reports-pax-shift-report.schema';
import { noOfBagsHasValue } from './pax-shift-field-coercion.util';

export function normalizeEmployeeRows(
  rows:
    | {
        id?: string;
        employeeCode?: string;
        employeeName?: string;
        trainingName?: string;
        trainingDate?: string;
      }[]
    | undefined,
): {
  id: string;
  employeeCode: string;
  employeeName: string;
  trainingName: string;
  trainingDate: string;
}[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: String(r.id ?? '').trim(),
    employeeCode: String(r.employeeCode ?? '').trim(),
    employeeName: String(r.employeeName ?? '').trim(),
    trainingName: String(r.trainingName ?? '').trim(),
    trainingDate: String(r.trainingDate ?? '').trim(),
  }));
}

export function sectionsMapToObject(
  sections: Map<string, PaxShiftEmployeeSectionBlock> | Record<string, unknown> | undefined,
): Record<
  string,
  {
    rows: {
      id: string;
      employeeCode: string;
      employeeName: string;
      trainingName: string;
      trainingDate: string;
    }[];
  }
> {
  const out: Record<
    string,
    {
      rows: {
        id: string;
        employeeCode: string;
        employeeName: string;
        trainingName: string;
        trainingDate: string;
      }[];
    }
  > = {};
  if (!sections) return out;

  const entries =
    sections instanceof Map
      ? Array.from(sections.entries())
      : Object.entries(sections as Record<string, unknown>);

  for (const [key, block] of entries) {
    const sec = block as PaxShiftEmployeeSectionBlock | undefined;
    out[key] = { rows: normalizeEmployeeRows(sec?.rows) };
  }
  return out;
}

export function flightReportHasOpenFormData(input: {
  flightDetails?: Record<string, unknown>;
  sections?: Map<string, PaxShiftEmployeeSectionBlock> | Record<string, unknown>;
  shortShippedBags?: { noOfBags?: number | string; rows?: unknown[] };
}): boolean {
  const details = input.flightDetails ?? {};
  if (
    Object.values(details).some((v) => {
      if (v == null) return false;
      if (typeof v === 'number') return Number.isFinite(v);
      return String(v).trim() !== '';
    })
  ) {
    return true;
  }

  const sectionsObj = sectionsMapToObject(input.sections);
  for (const block of Object.values(sectionsObj)) {
    if (block.rows.some((r) => r.employeeCode || r.employeeName)) return true;
  }

  const bags = input.shortShippedBags;
  if (typeof bags?.noOfBags === 'number') {
    if (noOfBagsHasValue(bags.noOfBags)) return true;
  } else if (String(bags?.noOfBags ?? '').trim() !== '') return true;
  if (Array.isArray(bags?.rows) && bags.rows.length > 0) return true;

  return false;
}

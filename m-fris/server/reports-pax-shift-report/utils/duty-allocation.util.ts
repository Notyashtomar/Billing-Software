import { DUTY_ALLOCATION_SINGLETON_SERIAL } from '../constants/reports-pax-shift-report.constants';
import type { PaxShiftDutyAllocationEntry } from '../schema/reports-pax-shift-report.schema';

export function isDutyAllocationSingletonSerial(flightSerial: string): boolean {
  return String(flightSerial ?? '').trim() === DUTY_ALLOCATION_SINGLETON_SERIAL;
}

export function dutyAllocationEntriesToObject(
  map:
    | Map<string, PaxShiftDutyAllocationEntry>
    | Record<string, unknown>
    | undefined,
): Record<string, PaxShiftDutyAllocationEntry> {
  const out: Record<string, PaxShiftDutyAllocationEntry> = {};
  if (!map) return out;
  const entries =
    map instanceof Map
      ? Array.from(map.entries())
      : Object.entries(map as Record<string, unknown>);
  for (const [key, block] of entries) {
    const k = String(key ?? '').trim();
    if (!k || k === DUTY_ALLOCATION_SINGLETON_SERIAL) continue;
    if (!block || typeof block !== 'object') continue;
    out[k] = block as PaxShiftDutyAllocationEntry;
  }
  return out;
}

export type LeanDutyAllocationEntryPayload = {
  _id: string;
  date: string;
  shift: string;
  flight: string;
  flightNo: string;
  staffAssignments: {
    staff: string;
    employeeCode: string;
    employeeName: string;
    dutyAllocations: string[];
  }[];
  createdAt?: Date;
  updatedAt?: Date;
};

export function leanDutyAllocationEntry(
  entryId: string,
  entry: PaxShiftDutyAllocationEntry | undefined,
  meta?: { createdAt?: Date; updatedAt?: Date },
): LeanDutyAllocationEntryPayload {
  const id = String(entryId ?? '').trim();
  const e = entry ?? {
    date: '',
    shift: '',
    flight: '',
    flightNo: '',
    staffAssignments: [],
  };
  return {
    _id: id,
    date: String(e.date ?? '').trim(),
    shift: String(e.shift ?? '').trim(),
    flight: String(e.flight ?? '').trim(),
    flightNo: String(e.flightNo ?? '').trim(),
    staffAssignments: (e.staffAssignments ?? []).map((s) => ({
      staff: String(s.staff ?? '').trim(),
      employeeCode: String(s.employeeCode ?? '').trim(),
      employeeName: String(s.employeeName ?? '').trim(),
      dutyAllocations: Array.isArray(s.dutyAllocations)
        ? s.dutyAllocations.map((d) => String(d).trim()).filter(Boolean)
        : [],
    })),
    createdAt: meta?.createdAt,
    updatedAt: meta?.updatedAt,
  };
}

/** Read a legacy per-document duty allocation row (pre-singleton). */
export function leanDutyAllocationFromLegacyDoc(doc: {
  _id?: unknown;
  date?: string;
  shift?: string;
  flight?: string;
  flightNo?: string;
  staffAssignments?: PaxShiftDutyAllocationEntry['staffAssignments'];
  createdAt?: Date;
  updatedAt?: Date;
}): LeanDutyAllocationEntryPayload {
  const id = String(doc._id ?? '').trim();
  return leanDutyAllocationEntry(
    id,
    {
      date: String(doc.date ?? '').trim(),
      shift: String(doc.shift ?? '').trim(),
      flight: String(doc.flight ?? '').trim(),
      flightNo: String(doc.flightNo ?? '').trim(),
      staffAssignments: doc.staffAssignments ?? [],
    },
    { createdAt: doc.createdAt, updatedAt: doc.updatedAt },
  );
}

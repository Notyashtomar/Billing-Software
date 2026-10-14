/** Client types + parsing for Pax duty allocation (`reports-pax-shift-report` singleton). */

export type StaffAssignmentRecord = {
  staff: string;
  employeeCode: string;
  employeeName: string;
  dutyAllocations: string[];
};

export type PaxDutyAllocationRecord = {
  id: string;
  date: string;
  shift: string;
  flight: string;
  flightNo: string;
  staffAssignments: StaffAssignmentRecord[];
  createdAt: string;
};

function readId(o: Record<string, unknown>): string {
  const raw = o._id ?? o.id;
  if (raw && typeof raw === 'object' && '$oid' in (raw as object)) {
    return String((raw as { $oid: string }).$oid);
  }
  return String(raw ?? '').trim();
}

export function mapPaxDutyAllocationFromApi(raw: unknown): PaxDutyAllocationRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = readId(o);
  if (!id) return null;
  const saRaw = o.staffAssignments;
  const staffAssignments: StaffAssignmentRecord[] = [];
  if (Array.isArray(saRaw)) {
    for (const item of saRaw) {
      if (!item || typeof item !== 'object') continue;
      const s = item as Record<string, unknown>;
      const dutiesRaw = s.dutyAllocations;
      const dutyAllocations = Array.isArray(dutiesRaw)
        ? dutiesRaw.map((x) => String(x).trim()).filter(Boolean)
        : [];
      staffAssignments.push({
        staff: String(s.staff ?? '').trim(),
        employeeCode: String(s.employeeCode ?? '').trim(),
        employeeName: String(s.employeeName ?? '').trim(),
        dutyAllocations,
      });
    }
  }
  const created =
    typeof o.createdAt === 'string'
      ? o.createdAt
      : o.createdAt && typeof o.createdAt === 'object' && 'toISOString' in (o.createdAt as Date)
        ? (o.createdAt as Date).toISOString()
        : new Date().toISOString();
  return {
    id,
    date: String(o.date ?? '').trim(),
    shift: String(o.shift ?? '').trim(),
    flight: String(o.flight ?? '').trim(),
    flightNo: String(o.flightNo ?? '').trim(),
    staffAssignments,
    createdAt: created,
  };
}

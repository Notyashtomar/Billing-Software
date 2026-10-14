import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer } from '@/lib/billing-shared/types';
import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { advanceDocId, advanceList, ADVANCE_PATHS, fetchAdvanceScheduleSetupMasters } from '@/lib/api';

function splitAircraftTokens(raw: string): string[] {
  return raw
    .split(/[,;/|]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = String(obj[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function toYmd(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const dash = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
  }
  return null;
}

function rangesOverlap(
  validFrom: string,
  validTo: string,
  rowFrom: string | null,
  rowTo: string | null,
): boolean {
  if (!rowFrom && !rowTo) return true;
  const from = rowFrom ?? rowTo ?? validFrom;
  const to = rowTo ?? rowFrom ?? validTo;
  return from <= validTo && validFrom <= to;
}

function addAircraftTokens(set: Set<string>, raw: string) {
  for (const token of splitAircraftTokens(raw)) {
    set.add(token);
  }
}

function aircraftFromOperationalData(op: Record<string, unknown>): string {
  return pickStr(op, 'aircraftType', 'TypeCraft', 'typeCraft', 'acType').toUpperCase();
}

function collectFromCustomer(customer: BillingCustomer | undefined, types: Set<string>) {
  if (!customer) return;
  for (const line of customer.scheduleLines ?? []) {
    if (line.aircraftType?.trim()) types.add(line.aircraftType.trim().toUpperCase());
  }
  if (customer.aircraftType?.trim()) {
    addAircraftTokens(types, customer.aircraftType);
  }
}

async function collectFromScheduledFlights(
  api: BillingApi,
  customerCode: string,
  validFrom: string,
  validTo: string,
  types: Set<string>,
) {
  try {
    const res = await api.listScheduledFlights({
      from: validFrom,
      to: validTo,
      customerCode,
      dateBasis: 'atd-date',
    });
    const rows =
      (res as { data?: { rows?: BillingSourceRow[] } }).data?.rows ?? [];
    for (const row of rows) {
      const ac = aircraftFromOperationalData(row.operationalData ?? {});
      if (ac) types.add(ac);
    }
  } catch {
    // Scheduled flights are best-effort; advance/customer data still apply.
  }
}

async function collectFromAdvanceScheduleSetup(
  customerCode: string,
  validFrom: string,
  validTo: string,
  types: Set<string>,
) {
  const code = customerCode.trim().toUpperCase();
  try {
    const masters = await fetchAdvanceScheduleSetupMasters();
    for (const doc of masters) {
      if (!doc || typeof doc !== 'object') continue;
      const root = doc as Record<string, unknown>;
      const data = (
        root.data && typeof root.data === 'object' && !Array.isArray(root.data)
          ? root.data
          : root
      ) as Record<string, unknown>;

      const rowCode = pickStr(data, 'Airline Code', 'airlineCode', 'code').toUpperCase();
      if (rowCode && rowCode !== code) continue;

      const rowFrom = toYmd(pickStr(data, 'validFrom', 'Valid From', 'STA Date', 'staDate'));
      const rowTo = toYmd(pickStr(data, 'validTo', 'Valid To', 'STD Date', 'stdDate'));
      if (!rangesOverlap(validFrom, validTo, rowFrom, rowTo)) continue;

      const aircraft = pickStr(data, 'aircraft', 'Aircraft', 'TypeCraft');
      if (aircraft) addAircraftTokens(types, aircraft);
    }
  } catch {
    // Ignore advance schedule setup failures.
  }
}

async function collectFromAdvanceGateway(
  customerCode: string,
  validFrom: string,
  validTo: string,
  types: Set<string>,
) {
  const code = customerCode.trim().toUpperCase();
  try {
    const list = (await advanceList(ADVANCE_PATHS.gatewayScheduledAirline)) as Record<
      string,
      unknown
    >[];
    for (const doc of list) {
      const g = advanceDocId(doc);
      const rowCode = String(g.code ?? '').trim().toUpperCase();
      if (!rowCode || rowCode !== code) continue;

      const rowFrom = toYmd(String(g.agreementValidFrom ?? ''));
      const rowTo = toYmd(String(g.agreementValidTo ?? ''));
      if (!rangesOverlap(validFrom, validTo, rowFrom, rowTo)) continue;

      const aircraft = pickStr(g as Record<string, unknown>, 'aircraft', 'Aircraft', 'TypeCraft');
      if (aircraft) addAircraftTokens(types, aircraft);
    }
  } catch {
    // Ignore gateway failures.
  }
}

/** All aircraft type codes from Advance → Aircraft master (gateway aircrafts). */
export async function fetchAdvanceAircraftMasterTypes(): Promise<string[]> {
  try {
    const list = (await advanceList(ADVANCE_PATHS.aircraft)) as Record<string, unknown>[];
    const seen = new Set<string>();
    for (const doc of list) {
      const d = advanceDocId(doc);
      const aircraft = String(d.aircraft ?? '').trim().toUpperCase();
      if (aircraft) seen.add(aircraft);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Aircraft types for a contract validity window — scheduled flights + advance + customer sync. */
export async function fetchContractAircraftTypeOptions(params: {
  api: BillingApi;
  customerCode: string;
  validFrom: string;
  validTo: string;
  customer?: BillingCustomer;
}): Promise<string[]> {
  const { api, customerCode, validFrom, validTo, customer } = params;
  const code = customerCode.trim().toUpperCase();
  if (!code || !validFrom || !validTo || validFrom > validTo) return [];

  const types = new Set<string>();
  const matchedCustomer =
    customer?.customerCode.trim().toUpperCase() === code ? customer : undefined;

  collectFromCustomer(matchedCustomer, types);
  await Promise.all([
    collectFromScheduledFlights(api, code, validFrom, validTo, types),
    collectFromAdvanceScheduleSetup(code, validFrom, validTo, types),
    collectFromAdvanceGateway(code, validFrom, validTo, types),
  ]);

  return [...types].sort((a, b) => a.localeCompare(b));
}

export function parseSelectedAircraftTypes(raw: string): string[] {
  return splitAircraftTokens(raw);
}

export function formatSelectedAircraftTypes(types: Iterable<string>): string {
  return [...new Set([...types].map((t) => t.trim().toUpperCase()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

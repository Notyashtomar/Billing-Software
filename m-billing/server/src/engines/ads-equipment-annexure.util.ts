import {
  isWchrSCombinedAdsService,
  resolveAdsPricingFromContractRule,
} from '../shared/ads-equipment-inclusion.util';
import {
  capTurnaroundCrewCoachUsedUnits,
  computeAdsUsedUnits,
  parseAdsRemarksQuantity,
  toWholeAdsUnits,
} from '../shared/fhr-equipment-to-ads-row';

export type AdsAnnexureContractRule = {
  serviceCode?: string;
  includedForAds?: boolean;
  alwaysChargeable?: boolean;
  freePerFlight?: number;
  freePerFlightNb?: number;
  freePerFlightWb?: number;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  uom?: string;
  aircraftType?: string;
  aircraftTypes?: string[];
  category?: string;
};

export type AdsAnnexurePrepRecord = {
  sourceRef?: Record<string, unknown> | null;
  operationalSnapshot?: Record<string, unknown> | null;
  rateMatch?: Record<string, unknown> | null;
};

export type AdsAnnexureColumn = {
  key: string;
  label: string;
};

export type AdsAnnexureFlightRow = {
  serialNo: string;
  flightNo: string;
  aircraftType: string;
  atdDate: string;
  counts: Record<string, number>;
};

export type AdsAnnexureTable = {
  columns: AdsAnnexureColumn[];
  rows: AdsAnnexureFlightRow[];
  totals: Record<string, number>;
};

const MONTH_YEAR_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function compactLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripServiceWrapper(value: string): string {
  return value
    .replace(
      /^(ADS|SCHEDULED|NON SCHEDULED|RAF|EQUIPMENT|MANPOWER)(\s+(ADS|SCHEDULED|NON SCHEDULED|RAF|EQUIPMENT|MANPOWER))*\s+/gi,
      '',
    )
    .trim();
}

/** Short annexure header: GPU-140KV, ACU, ASU-WB, PSL-WB, CREW COACH. */
export function adsAnnexureColumnLabel(serviceCode: string): string {
  const stripped = stripServiceWrapper(compactLabel(serviceCode));
  if (!stripped) return 'EQ';
  const compact = stripped.replace(/\s+/g, '');
  const aliases: Array<[RegExp, string]> = [
    [/\bWCHC\b|WHEEL\s*CHAIR\s*C/, 'WCHC'],
    [/\bWCHR\s*\/\s*S\b|\bWCHRS\b|\bWCHR\b|\bWCHS\b|WHEEL\s*CHAIR\s*[RS]/, 'WCHR/S'],
    [/\bGPU\b.*140/, 'GPU-140KV'],
    [/\bGPU\b.*180/, 'GPU-180KV'],
    [/\bGPU\b.*90/, 'GPU-90KV'],
    [/\bGPU\b.*WB|GPUWB/, 'GPU-WB'],
    [/\bGPU\b.*NB|GPUNB/, 'GPU-NB'],
    [/\bGPU\b/, 'GPU'],
    [/\bACU\b.*WB|ACUWB/, 'ACU-WB'],
    [/\bACU\b.*NB|ACUNB/, 'ACU-NB'],
    [/\bACU\b|AIR\s*CONDITION/, 'ACU'],
    [/\bASU\b.*WB|AIR\s*START.*WIDE/, 'ASU-WB'],
    [/\bASU\b.*NB|AIR\s*START.*NARROW/, 'ASU-NB'],
    [/\bASU\b|AIR\s*START/, 'ASU'],
    [/\bAMB\b|AMBULIFT/, 'AMB'],
    [/\bPBNB\b|PUSH\s*BACK.*NARROW/, 'PB-NB'],
    [/\bPBWB\b|PUSH\s*BACK.*WIDE/, 'PB-WB'],
    [/\bPSL\b.*WB|PASSENGER\s*STEP.*WIDE|MOTORIZED\s*PASSENGER\s*STEP/, 'PSL-WB'],
    [/\bPSL\b|PASSENGER\s*STEP/, 'PSL'],
    [/\bHS\b|HEAD\s*SET|HEADSET/, 'HS'],
    [/CREW\s*COACH/, 'CREW-COACH'],
    [/PAX\s*COACH|PASSENGER\s*COACH/, 'PAX-COACH'],
    [/\bPTOW\b|INTER\s*STAND|TOW\b/, 'TOW'],
    [/\bTOILET\b|\bPS-TS\b|\bTS\b/, 'TOILET'],
    [/\bWATER\b|\bPS-WS\b|\bPW\b/, 'WATER'],
    [/\bDGR\b/, 'DGR'],
    [/\bUH\b|UTILITY\s*HAND/, 'UH'],
    [/BLUE\s*COLLAR|\bBC\b/, 'BC'],
    [/WHITE\s*COLLAR|\bWC\b/, 'WC'],
    [/\bMARSHAL/, 'M'],
    [/\bRAMP\s*CAR\b|\bRC\b/, 'RC'],
  ];
  for (const [pattern, label] of aliases) {
    if (pattern.test(stripped) || pattern.test(compact)) return label;
  }
  const tokens = stripped.split(' ').filter(Boolean);
  if (tokens.length <= 3 && stripped.length <= 14) return stripped;
  return tokens
    .map((token) => token.slice(0, 4))
    .join('-')
    .slice(0, 14);
}

function ruleUnitPrice(rule: AdsAnnexureContractRule): number {
  const inr = Number(rule.unitPriceINR);
  if (Number.isFinite(inr) && inr > 0) return inr;
  const usd = Number(rule.unitPriceUSD);
  return Number.isFinite(usd) && usd > 0 ? usd : 0;
}

/**
 * Clauses-tab rows that can appear on an ADS annexure: priced, included, and
 * either always billed or billed after a free allowance.
 */
export function adsAnnexureBillableRules(
  rules: AdsAnnexureContractRule[] | null | undefined,
): AdsAnnexureContractRule[] {
  const seen = new Set<string>();
  const out: AdsAnnexureContractRule[] = [];
  for (const rule of rules ?? []) {
    const serviceCode = String(rule.serviceCode ?? '').trim();
    if (!serviceCode) continue;
    if (rule.includedForAds === false) continue;
    if (!(ruleUnitPrice(rule) > 0)) continue;
    const key = isWchrSCombinedAdsService(serviceCode) ? 'WCHR/S' : compactLabel(serviceCode);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

export function adsAnnexureColumnsFromRules(
  rules: AdsAnnexureContractRule[] | null | undefined,
): AdsAnnexureColumn[] {
  return adsAnnexureBillableRules(rules)
    .map((rule) => {
      const serviceCode = String(rule.serviceCode ?? '').trim();
      const key = isWchrSCombinedAdsService(serviceCode)
        ? 'WCHR/S'
        : compactLabel(serviceCode);
      return { key, label: adsAnnexureColumnLabel(serviceCode) };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function usedUnits(rec: AdsAnnexurePrepRecord, uom: string, particular: string): number {
  const snap = rec.operationalSnapshot ?? {};
  const rate = rec.rateMatch ?? {};
  const remarksText = String(snap.remarks ?? snap.Remarks ?? '').trim();
  const hoursRaw = Number(snap.usageHours);
  const emptyClock =
    remarksText === '00:00' || remarksText === '0:00' || remarksText === '00:00:00';
  const usageHours =
    emptyClock && hoursRaw === 24
      ? null
      : Number.isFinite(hoursRaw) && hoursRaw > 0
        ? hoursRaw
        : null;
  const usedRaw = Number(rate.usedUnits ?? snap.adsUsedUnits ?? 0);
  const qtyRaw = Number(
    snap.qty ?? (emptyClock ? usedRaw : snap.chargeableUnits ?? usedRaw),
  );
  const remarksQty =
    Number(snap.remarksQuantity) > 0
      ? Number(snap.remarksQuantity)
      : parseAdsRemarksQuantity(snap.remarks ?? snap.Remarks);
  const usedFromContractUom = computeAdsUsedUnits({
    qty:
      Number.isFinite(qtyRaw) && qtyRaw > 0
        ? qtyRaw
        : Number.isFinite(usedRaw) && usedRaw > 0
          ? usedRaw
          : 1,
    usageHours,
    uom,
    remarksQuantity: remarksQty && Number.isFinite(remarksQty) ? remarksQty : null,
  });
  return capTurnaroundCrewCoachUsedUnits(usedFromContractUom, snap, particular);
}

function serialNoOf(rec: AdsAnnexurePrepRecord): string {
  const ref = rec.sourceRef ?? {};
  const snap = rec.operationalSnapshot ?? {};
  const serial = String(
    ref.serialNo ?? snap.serialNumber ?? snap.serialNo ?? snap.SerialNo ?? '',
  ).trim();
  return serial;
}

function flightNoOf(rec: AdsAnnexurePrepRecord): string {
  const ref = rec.sourceRef ?? {};
  const snap = rec.operationalSnapshot ?? {};
  return String(ref.flightNo ?? snap.flightNo ?? snap.flightNoEquipmentNo ?? '').trim();
}

function aircraftTypeOf(rec: AdsAnnexurePrepRecord): string {
  const snap = rec.operationalSnapshot ?? {};
  const rate = rec.rateMatch ?? {};
  return String(
    rate.aircraftType ?? snap.aircraftType ?? snap.TypeCraft ?? snap.ACType ?? '',
  ).trim();
}

function dmyFromYmd(ymd: string): string {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
}

function atdDateOf(rec: AdsAnnexurePrepRecord): string {
  const snap = rec.operationalSnapshot ?? {};
  const raw = String(
    snap.atdDate ??
      snap.ATDDate ??
      snap.ataDate ??
      snap.ATADate ??
      snap.billingDateYmd ??
      snap.staDate ??
      '',
  ).trim();
  if (!raw) return '';
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return dmyFromYmd(raw);
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!dmy) return raw;
  const year = dmy[3].length === 2 ? dmy[3] : dmy[3].slice(2);
  return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${year}`;
}

function ymdSortKey(rec: AdsAnnexurePrepRecord): string {
  const snap = rec.operationalSnapshot ?? {};
  const raw = String(
    snap.atdDate ?? snap.ATDDate ?? snap.ataDate ?? snap.ATADate ?? snap.billingDateYmd ?? '',
  ).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return raw;
}

function chargedUnits(used: number, alwaysChargeable: boolean, freePerFlight: number): number {
  if (alwaysChargeable) return toWholeAdsUnits(used);
  const allowance = Number.isFinite(freePerFlight) && freePerFlight > 0 ? Math.floor(freePerFlight) : 0;
  return toWholeAdsUnits(Math.max(0, used - allowance));
}

function pricingForRecord(
  rec: AdsAnnexurePrepRecord,
  rules: AdsAnnexureContractRule[],
) {
  const snap = rec.operationalSnapshot ?? {};
  const rate = rec.rateMatch ?? {};
  const particular = String(
    rate.particular ?? snap.adsParticular ?? snap.particular ?? snap.equipment ?? '',
  ).trim();
  const equipmentName = String(
    snap.equipment_name ?? snap.equipmentName ?? snap.equipment ?? '',
  ).trim();
  const serviceCode = String(rate.serviceCode ?? snap.adsServiceCode ?? '').trim();
  const aircraftType = aircraftTypeOf(rec);
  return resolveAdsPricingFromContractRule(
    { adsEquipmentRules: rules },
    {
      serviceCode: serviceCode || particular,
      particular,
      equipmentName,
      aircraftType,
      aircraftBody: String(snap.aircraftBody ?? snap.bodyType ?? snap.aircraftBodyType ?? ''),
      flightCategory: String(snap.flightCategory ?? snap.categoryOfFlight ?? ''),
      billingCurrency: 'INR',
    },
  );
}

/**
 * Flights that used equipment outside the free allowance, or always-billed
 * equipment (GPU / ACU / ASU). Columns come only from contract clauses.
 */
export function buildAdsAnnexureTable(
  records: AdsAnnexurePrepRecord[],
  rules: AdsAnnexureContractRule[] | null | undefined,
): AdsAnnexureTable {
  const billable = adsAnnexureBillableRules(rules);
  const columns = adsAnnexureColumnsFromRules(billable);
  const flights = new Map<
    string,
    AdsAnnexureFlightRow & {
      sortKey: string;
      usedByKey: Record<string, number>;
      freeByKey: Record<string, number>;
      alwaysByKey: Record<string, boolean>;
    }
  >();

  for (const rec of records) {
    const pricing = pricingForRecord(rec, billable);
    if (!pricing.matched || pricing.excluded || !(pricing.unitPrice != null && pricing.unitPrice > 0)) {
      continue;
    }
    const particular = String(
      rec.rateMatch?.particular ??
        rec.operationalSnapshot?.adsParticular ??
        rec.operationalSnapshot?.particular ??
        pricing.serviceCode,
    ).trim();
    const used = usedUnits(rec, pricing.uom, particular);
    if (!(used > 0)) continue;
    const serial = serialNoOf(rec);
    const flightKey = serial || `${flightNoOf(rec)}|${atdDateOf(rec)}`;
    if (!flightKey) continue;
    const columnKey = isWchrSCombinedAdsService(pricing.serviceCode, particular)
      ? 'WCHR/S'
      : compactLabel(pricing.serviceCode);
    let row = flights.get(flightKey);
    if (!row) {
      row = {
        serialNo: serial,
        flightNo: flightNoOf(rec),
        aircraftType: aircraftTypeOf(rec),
        atdDate: atdDateOf(rec),
        counts: {},
        sortKey: ymdSortKey(rec),
        usedByKey: {},
        freeByKey: {},
        alwaysByKey: {},
      };
      flights.set(flightKey, row);
    }
    row.usedByKey[columnKey] = (row.usedByKey[columnKey] ?? 0) + used;
    row.freeByKey[columnKey] = Math.max(row.freeByKey[columnKey] ?? 0, pricing.freePerFlight);
    row.alwaysByKey[columnKey] = row.alwaysByKey[columnKey] === true || pricing.alwaysChargeable;
    if (!row.serialNo && serial) row.serialNo = serial;
    if (!row.flightNo) row.flightNo = flightNoOf(rec);
    if (!row.aircraftType) row.aircraftType = aircraftTypeOf(rec);
    if (!row.atdDate) row.atdDate = atdDateOf(rec);
  }

  const rows: AdsAnnexureFlightRow[] = [];
  for (const row of [...flights.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey.localeCompare(b.sortKey);
    return a.serialNo.localeCompare(b.serialNo, undefined, { numeric: true });
  })) {
    const counts: Record<string, number> = {};
    let billedOnFlight = false;
    for (const key of Object.keys(row.usedByKey)) {
      const charged = chargedUnits(
        row.usedByKey[key] ?? 0,
        row.alwaysByKey[key] === true,
        row.freeByKey[key] ?? 0,
      );
      if (charged > 0) {
        counts[key] = charged;
        billedOnFlight = true;
      }
    }
    if (!billedOnFlight) continue;
    rows.push({
      serialNo: row.serialNo,
      flightNo: row.flightNo,
      aircraftType: row.aircraftType,
      atdDate: row.atdDate,
      counts,
    });
  }

  const usedKeys = new Set(rows.flatMap((row) => Object.keys(row.counts)));
  const visibleColumns = columns.filter((column) => usedKeys.has(column.key));
  const totals: Record<string, number> = {};
  for (const column of visibleColumns) {
    totals[column.key] = rows.reduce((sum, row) => sum + (row.counts[column.key] ?? 0), 0);
  }
  return { columns: visibleColumns, rows, totals };
}

export function adsAnnexureMonthLabel(start?: Date | string | null): string {
  if (!start) return '';
  const date = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(date.getTime())) return '';
  const month = MONTH_YEAR_NAMES[date.getUTCMonth()];
  return month ? `${month}-${date.getUTCFullYear()}` : '';
}

export function adsAnnexureTitleLine(opts: {
  monthLabel: string;
  invoiceNumber: string;
}): string {
  const invoiceNumber = String(opts.invoiceNumber ?? '').trim() || '—';
  const month = String(opts.monthLabel ?? '').trim() || '—';
  return `Additional Equipment Annexure for the month ${month} against Invoice No.:-${invoiceNumber}`;
}

export function adsAnnexureFileName(invoiceNumber: string): string {
  const slug = String(invoiceNumber ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `ADS-Annexure-${slug || 'invoice'}.pdf`;
}

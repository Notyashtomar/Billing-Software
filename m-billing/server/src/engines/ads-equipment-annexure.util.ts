import {
  adsEquipmentLabelsMatch,
  adsWheelchairSubtype,
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

export type AdsAnnexureInvoiceLine = {
  description?: string | null;
  quantity?: number | null;
  sourceType?: string | null;
  serviceCode?: string | null;
  sourceRef?: Record<string, unknown> | null;
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
  const chair = adsWheelchairSubtype(stripped);
  if (chair === 'BOTH') return 'WCHR/S';
  if (chair === 'WCHR') return 'WCHR';
  if (chair === 'WCHS') return 'WCHS';
  const aliases: Array<[RegExp, string]> = [
    [/\bWCHC\b|WHEEL\s*CHAIR\s*C/, 'WCHC'],
    [/140\s*KV|\bGPU\b.*140/, 'GPU-140KV'],
    [/180\s*KV|\bGPU\b.*180/, 'GPU-180KV'],
    [/90\s*KV|\bGPU\b.*90/, 'GPU-90KV'],
    [/\bGPU\b.*WB|GPUWB|GROUND\s*POWER.*WIDE/, 'GPU-WB'],
    [/\bGPU\b.*NB|GPUNB|GROUND\s*POWER.*NARROW/, 'GPU-NB'],
    [/\bGPU\b|GROUND\s*POWER/, 'GPU'],
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
    snap.qty ??
      snap.equipment_quantity ??
      snap.equipmentQuantity ??
      (emptyClock ? usedRaw : snap.chargeableUnits ?? usedRaw),
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

function kvTag(value: unknown): string | null {
  const match = compactLabel(value).replace(/\s+/g, '').match(/(90|140|180|280)KV/);
  return match?.[1] ?? null;
}

function isAdsParticularLine(line: AdsAnnexureInvoiceLine): boolean {
  const description = String(line.description ?? '').trim();
  if (/^ceiling rate$/i.test(description)) return false;
  const sourceType = String(line.sourceType ?? '').trim().toLowerCase();
  const serviceCode = String(line.serviceCode ?? '').trim().toUpperCase();
  return (
    sourceType === 'ads' ||
    sourceType === 'equipment' ||
    sourceType === 'manpower' ||
    serviceCode === 'ADS'
  );
}

type AnnexureEquipment = {
  key: string;
  label: string;
  texts: string[];
  invoiceUsed: number | null;
  invoiceCharged: number | null;
};

function equipmentTexts(line: AdsAnnexureInvoiceLine): string[] {
  const ref = line.sourceRef ?? {};
  return [
    String(ref.equipmentServiceCode ?? '').trim(),
    String(ref.particular ?? '').trim(),
    String(line.description ?? '').trim(),
    String(ref.serviceCode ?? '').trim(),
  ].filter(Boolean);
}

function annexureEquipmentFromLine(line: AdsAnnexureInvoiceLine): AnnexureEquipment | null {
  const texts = equipmentTexts(line);
  if (texts.length === 0) return null;
  const chair = adsWheelchairSubtype(...texts);
  const displayName = texts[0] ?? '';
  const ref = line.sourceRef ?? {};
  const usedRaw = Number(ref.usedQuantity);
  const chargedRaw = Number(ref.chargedQuantity ?? line.quantity);
  const label =
    chair === 'BOTH' ? 'WCHR/S' : chair === 'WCHR' ? 'WCHR' : chair === 'WCHS' ? 'WCHS' : adsAnnexureColumnLabel(displayName);
  return {
    key: chair === 'WCHR' || chair === 'WCHS' || chair === 'BOTH' ? (chair === 'BOTH' ? 'WCHR/S' : chair) : label,
    label,
    texts,
    invoiceUsed: Number.isFinite(usedRaw) && usedRaw >= 0 ? toWholeAdsUnits(usedRaw) : null,
    invoiceCharged: Number.isFinite(chargedRaw) && chargedRaw >= 0 ? toWholeAdsUnits(chargedRaw) : null,
  };
}

function annexureEquipmentFromUsage(key: string, serviceCode: string): AnnexureEquipment {
  return {
    key,
    label: adsAnnexureColumnLabel(serviceCode),
    texts: [serviceCode],
    invoiceUsed: null,
    invoiceCharged: null,
  };
}

function usageIdentityKey(serviceCode: string, particular: string, equipmentName: string): string {
  if (isWchrSCombinedAdsService(serviceCode, particular, equipmentName)) return 'WCHR/S';
  return compactLabel(serviceCode || particular || equipmentName) || 'EQ';
}

function textsMatchEquipment(equipment: AnnexureEquipment, texts: string[]): boolean {
  if (equipment.key === 'WCHR/S') return isWchrSCombinedAdsService(...texts);
  if (equipment.key === 'WCHR') return adsWheelchairSubtype(...texts) === 'WCHR';
  if (equipment.key === 'WCHS') return adsWheelchairSubtype(...texts) === 'WCHS';
  return equipment.texts.some((left) => texts.some((right) => adsEquipmentLabelsMatch(left, right)));
}

function pickEquipmentForUsage(
  equipments: AnnexureEquipment[],
  texts: string[],
): AnnexureEquipment | null {
  const matches = equipments.filter((equipment) => textsMatchEquipment(equipment, texts));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  const wantedKv = texts.map((value) => kvTag(value)).find(Boolean) ?? null;
  if (wantedKv) {
    const kvHit = matches.find((equipment) => equipment.texts.some((text) => kvTag(text) === wantedKv));
    if (kvHit) return kvHit;
  }
  const wantedCompact = texts.map((value) => compactLabel(value)).find(Boolean) ?? '';
  const exact = matches.find((equipment) =>
    equipment.texts.some((text) => compactLabel(text) === wantedCompact),
  );
  return exact ?? matches[0]!;
}

function displayColumnsForEquipment(equipment: AnnexureEquipment): AdsAnnexureColumn[] {
  return [{ key: equipment.key, label: equipment.label }];
}

function pricingForRecord(
  rec: AdsAnnexurePrepRecord,
  rules: AdsAnnexureContractRule[],
) {
  const snap = rec.operationalSnapshot ?? {};
  const rate = rec.rateMatch ?? {};
  const particular = String(
    rate.particular ??
      snap.adsParticular ??
      snap.particular ??
      snap.equipment ??
      rate.serviceCode ??
      '',
  ).trim();
  const equipmentName = String(
    snap.equipment_name ??
      snap.equipmentName ??
      snap.equipmentCode ??
      snap.abbr ??
      snap.equipment ??
      '',
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
      aircraftBody: String(
        snap.aircraftBody ?? snap.AircraftBody ?? snap.bodyType ?? snap.aircraftBodyType ?? '',
      ),
      flightCategory: String(
        snap.categoryOfFlight ?? snap.Cate_of_Flight ?? snap.flightCategory ?? '',
      ),
      billingCurrency: 'INR',
    },
  );
}

/**
 * One annexure column per ADS invoice particular. The count is the chargeable
 * quantity for that flight. Usage inside the free allowance is left blank.
 */
export function buildAdsAnnexureTable(
  records: AdsAnnexurePrepRecord[],
  rules: AdsAnnexureContractRule[] | null | undefined,
  invoiceLines?: AdsAnnexureInvoiceLine[] | null,
): AdsAnnexureTable {
  const contractRules = rules ?? [];
  const fromInvoice = (invoiceLines ?? [])
    .filter(isAdsParticularLine)
    .map((line) => annexureEquipmentFromLine(line))
    .filter((equipment): equipment is AnnexureEquipment => Boolean(equipment));
  const invoiceEquipments: AnnexureEquipment[] = [];
  for (const equipment of fromInvoice) {
    const existing = invoiceEquipments.find((item) => item.key === equipment.key);
    if (!existing) {
      invoiceEquipments.push(equipment);
      continue;
    }
    existing.texts.push(...equipment.texts);
    if (equipment.invoiceUsed != null) {
      existing.invoiceUsed = (existing.invoiceUsed ?? 0) + equipment.invoiceUsed;
    }
    if (equipment.invoiceCharged != null) {
      existing.invoiceCharged = (existing.invoiceCharged ?? 0) + equipment.invoiceCharged;
    }
  }
  const lockToInvoice = invoiceEquipments.length > 0;
  const discovered = new Map<string, AnnexureEquipment>();
  const flights = new Map<
    string,
    AdsAnnexureFlightRow & {
      sortKey: string;
      usedByKey: Record<string, number>;
      wchrUsedByKey: Record<string, number>;
      wchsUsedByKey: Record<string, number>;
      freeByKey: Record<string, number>;
      alwaysByKey: Record<string, boolean>;
    }
  >();

  for (const rec of records) {
    let pricing = pricingForRecord(rec, contractRules);
    const storedPrice = Number(rec.rateMatch?.unitPrice ?? 0);
    const livePriced =
      pricing.matched && !pricing.excluded && pricing.unitPrice != null && pricing.unitPrice > 0;
    if (!livePriced) {
      if (!(storedPrice > 0)) continue;
      const storedFree = Number(rec.rateMatch?.freeAllowance ?? 0);
      pricing = {
        ...pricing,
        matched: true,
        excluded: false,
        alwaysChargeable: false,
        freePerFlight: Number.isFinite(storedFree) && storedFree > 0 ? storedFree : 0,
        unitPrice: storedPrice,
        uom: String(rec.rateMatch?.uom ?? pricing.uom ?? 'Per Service'),
        serviceCode: String(
          rec.rateMatch?.serviceCode ?? rec.rateMatch?.particular ?? pricing.serviceCode ?? '',
        ),
      };
    }
    const particular = String(
      rec.rateMatch?.particular ??
        rec.operationalSnapshot?.adsParticular ??
        rec.operationalSnapshot?.particular ??
        pricing.serviceCode,
    ).trim();
    const equipmentName = String(
      rec.operationalSnapshot?.equipment_name ??
        rec.operationalSnapshot?.equipmentName ??
        rec.operationalSnapshot?.equipment ??
        '',
    ).trim();
    const texts = [pricing.serviceCode, particular, equipmentName].filter(Boolean);
    const equipment = lockToInvoice
      ? pickEquipmentForUsage(invoiceEquipments, texts)
      : annexureEquipmentFromUsage(
          usageIdentityKey(pricing.serviceCode, particular, equipmentName),
          pricing.serviceCode || particular,
        );
    if (!equipment) continue;
    if (!lockToInvoice && !discovered.has(equipment.key)) {
      discovered.set(equipment.key, equipment);
    }
    const recomputed = toWholeAdsUnits(usedUnits(rec, pricing.uom, particular));
    const storedUsed = toWholeAdsUnits(
      Number(rec.rateMatch?.usedUnits ?? rec.operationalSnapshot?.adsUsedUnits ?? 0),
    );
    const used = recomputed > 0 ? recomputed : storedUsed;
    if (!(used > 0)) continue;
    const serial = serialNoOf(rec);
    const flightKey = serial || `${flightNoOf(rec)}|${atdDateOf(rec)}`;
    if (!flightKey) continue;
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
        wchrUsedByKey: {},
        wchsUsedByKey: {},
        freeByKey: {},
        alwaysByKey: {},
      };
      flights.set(flightKey, row);
    }
    row.usedByKey[equipment.key] = (row.usedByKey[equipment.key] ?? 0) + used;
    const chairKind = adsWheelchairSubtype(equipmentName, particular, String(rec.rateMatch?.serviceCode ?? ''));
    if (chairKind === 'WCHR') {
      row.wchrUsedByKey[equipment.key] = (row.wchrUsedByKey[equipment.key] ?? 0) + used;
    } else if (chairKind === 'WCHS') {
      row.wchsUsedByKey[equipment.key] = (row.wchsUsedByKey[equipment.key] ?? 0) + used;
    } else if (chairKind === 'BOTH') {
      row.wchrUsedByKey[equipment.key] = (row.wchrUsedByKey[equipment.key] ?? 0) + used;
      row.wchsUsedByKey[equipment.key] = (row.wchsUsedByKey[equipment.key] ?? 0) + used;
    }
    row.freeByKey[equipment.key] = Math.max(row.freeByKey[equipment.key] ?? 0, pricing.freePerFlight);
    row.alwaysByKey[equipment.key] =
      row.alwaysByKey[equipment.key] === true || pricing.alwaysChargeable;
    if (!row.serialNo && serial) row.serialNo = serial;
    if (!row.flightNo) row.flightNo = flightNoOf(rec);
    if (!row.aircraftType) row.aircraftType = aircraftTypeOf(rec);
    if (!row.atdDate) row.atdDate = atdDateOf(rec);
  }

  const equipments = lockToInvoice
    ? invoiceEquipments
    : [...discovered.values()].sort(
        (a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
      );
  const chargedTotals: Record<string, number> = {};
  const chargedByFlight = new Map<string, Record<string, number>>();
  for (const row of flights.values()) {
    const charged: Record<string, number> = {};
    for (const key of Object.keys(row.usedByKey)) {
      const used = row.usedByKey[key] ?? 0;
      const billed = chargedUnits(used, row.alwaysByKey[key] === true, row.freeByKey[key] ?? 0);
      charged[key] = billed;
      chargedTotals[key] = (chargedTotals[key] ?? 0) + billed;
    }
    chargedByFlight.set(`${row.serialNo}|${row.flightNo}|${row.atdDate}|${row.sortKey}`, charged);
  }

  for (const equipment of equipments) {
    if (equipment.key !== 'WCHR/S' && equipment.label !== 'WCHR/S') continue;
    let wchrCharged = false;
    let wchsCharged = false;
    let wchrUsed = false;
    let wchsUsed = false;
    for (const row of flights.values()) {
      const billed = chargedByFlight.get(
        `${row.serialNo}|${row.flightNo}|${row.atdDate}|${row.sortKey}`,
      )?.[equipment.key] ?? 0;
      const wchr = row.wchrUsedByKey[equipment.key] ?? 0;
      const wchs = row.wchsUsedByKey[equipment.key] ?? 0;
      if (wchr > 0) wchrUsed = true;
      if (wchs > 0) wchsUsed = true;
      if (billed > 0 && wchr > 0) wchrCharged = true;
      if (billed > 0 && wchs > 0) wchsCharged = true;
    }
    const showWchr = wchrCharged || wchsCharged ? wchrCharged : wchrUsed;
    const showWchs = wchrCharged || wchsCharged ? wchsCharged : wchsUsed;
    if (showWchr && !showWchs) equipment.label = 'WCHR';
    else if (showWchs && !showWchr) equipment.label = 'WCHS';
    else if (showWchr && showWchs) equipment.label = 'WCHR/S';
  }

  const columns: AdsAnnexureColumn[] = [];
  for (const equipment of equipments) {
    const chargedTotal = toWholeAdsUnits(chargedTotals[equipment.key] ?? 0);
    if (!lockToInvoice && chargedTotal <= 0) continue;
    columns.push(...displayColumnsForEquipment(equipment));
  }

  const rows: AdsAnnexureFlightRow[] = [];
  for (const row of [...flights.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey.localeCompare(b.sortKey);
    return a.serialNo.localeCompare(b.serialNo, undefined, { numeric: true });
  })) {
    const charged = chargedByFlight.get(`${row.serialNo}|${row.flightNo}|${row.atdDate}|${row.sortKey}`) ?? {};
    const counts: Record<string, number> = {};
    let chargedOnFlight = false;
    for (const equipment of equipments) {
      const billed = toWholeAdsUnits(charged[equipment.key] ?? 0);
      if (billed > 0) {
        chargedOnFlight = true;
        counts[equipment.key] = billed;
      }
    }
    if (!chargedOnFlight) continue;
    rows.push({
      serialNo: row.serialNo,
      flightNo: row.flightNo,
      aircraftType: row.aircraftType,
      atdDate: row.atdDate,
      counts,
    });
  }

  const visibleKeys = new Set(columns.map((column) => column.key));
  const totals: Record<string, number> = {};
  for (const column of columns) {
    totals[column.key] = rows.reduce((sum, row) => sum + (row.counts[column.key] ?? 0), 0);
  }
  return {
    columns: columns.filter((column) => visibleKeys.has(column.key)),
    rows,
    totals,
  };
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

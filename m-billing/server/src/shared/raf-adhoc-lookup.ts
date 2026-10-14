import { normalizeAdhocKey } from './ads-adhoc-tariff';

export type RafAdhocLookupEntry = {
  label: string;
  stationCode: string;
  validFrom: Date;
  validTo: Date;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  uom: string;
  percentValue?: number;
};

/**
 * Excel / catalog short codes → RAF adhoc tariff particulars.
 * Used when billed-services rows carry codes like GPU-140KV / PBNB.
 */
export const RAF_ADHOC_CODE_ALIASES: Record<string, string[]> = {
  'gpu-140kv': ['Ground Power Unit (GPU) 140 KV', 'GPU 140 KV'],
  'gpu-nb': ['Ground Power Unit (GPU) 90 KV', 'GPU 90 KV'],
  'gpu-90kv': ['Ground Power Unit (GPU) 90 KV', 'GPU 90 KV'],
  pbnb: ['Push Back (Tow Bar included) Narrow Body'],
  istnb: ['Tow Inter Stand - Narrow Body'],
  rc: [
    'Ramp to Flight Deck Communication- Narrow Body',
    'Ramp to Flight Deck Communication Narrow Body',
    'Ramp Car',
  ],
  wc: ['Water service'],
  ebt: ['Conveyor belt loader'],
  uh: ['Floor Walkers/Welcome staff', 'Manpower (Blue collar)'],
};

function expandLookupKeys(particular: string): string[] {
  const raw = String(particular ?? '').trim();
  if (!raw) return [];
  const stripped = raw
    .replace(/^raf\s*-\s*(equipment|manpower|service)\s*-\s*/i, '')
    .trim();
  const keys = new Set<string>();
  keys.add(normalizeAdhocKey(raw));
  if (stripped) keys.add(normalizeAdhocKey(stripped));

  const aliasKey = normalizeAdhocKey(stripped || raw).replace(/\s+/g, '-');
  const compact = normalizeAdhocKey(stripped || raw).replace(/\s+/g, '');
  for (const [code, labels] of Object.entries(RAF_ADHOC_CODE_ALIASES)) {
    const codeNorm = normalizeAdhocKey(code).replace(/\s+/g, '');
    if (
      aliasKey === code ||
      compact === codeNorm ||
      normalizeAdhocKey(stripped) === normalizeAdhocKey(code)
    ) {
      for (const label of labels) keys.add(normalizeAdhocKey(label));
    }
  }
  return [...keys].filter(Boolean);
}

export function lookupRafAdhocRate(
  particular: string,
  entries: RafAdhocLookupEntry[],
  opts: { stationCode?: string; billingDate: Date; domestic?: boolean },
): { unitPrice: number; uom: string; label: string; pricingBasis: 'adhoc' } | null {
  const keys = expandLookupKeys(particular);
  if (!keys.length) return null;
  const station = String(opts.stationCode ?? '').trim().toUpperCase();
  const t = opts.billingDate.getTime();

  const inWindow = entries.filter((e) => {
    const from = e.validFrom.getTime();
    const to = e.validTo.getTime();
    if (Number.isFinite(from) && t < from) return false;
    if (Number.isFinite(to) && t > to) return false;
    return true;
  });

  const preferStation = (list: RafAdhocLookupEntry[]) => {
    const specific = station ? list.filter((e) => e.stationCode === station) : [];
    if (specific.length) return specific;
    return list.filter((e) => e.stationCode === '*' || e.stationCode === 'ALL');
  };

  const scoped = preferStation(inWindow);
  if (!scoped.length) return null;

  const scored = scoped
    .map((entry) => {
      const ek = normalizeAdhocKey(entry.label);
      let score = 0;
      for (const key of keys) {
        if (ek === key) score = Math.max(score, 3);
        else if (key.includes(ek) || ek.includes(key)) score = Math.max(score, 2);
        else {
          const token = key.split(' ').filter((x) => x.length >= 3).pop();
          if (
            token &&
            (ek.includes(token) || token.includes(ek.split(' ').pop() ?? ''))
          ) {
            score = Math.max(score, 1);
          }
        }
      }
      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const hit = scored[0]?.entry;
  if (!hit) return null;
  if (hit.percentValue != null && hit.unitPriceINR == null && hit.unitPriceUSD == null) {
    return null;
  }
  const domestic = opts.domestic !== false;
  const unitPrice = domestic ? Number(hit.unitPriceINR) : Number(hit.unitPriceUSD);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return { unitPrice, uom: hit.uom, label: hit.label, pricingBasis: 'adhoc' };
}

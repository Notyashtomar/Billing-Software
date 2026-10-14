/**
 * Airline-specific equipment annexure PDFs (ADS, BHS, Custom).
 * Files live in `apps/web/public/billing/annexures/` (copied from `apps/api/data`).
 * Keys are billing customer codes (IATA-style).
 */
export type AdsAirlineAnnexureFile = {
  file: string;
  title: string;
};

export type AdsAirlineAnnexureEntry = {
  airline: string;
  files: AdsAirlineAnnexureFile[];
};

export const ADS_ANNEXURE_PUBLIC_DIR = '/billing/annexures';

export const ADS_AIRLINE_ANNEXURES: Record<string, AdsAirlineAnnexureEntry> = {
  GF: {
    airline: 'Gulf Air',
    files: [{ file: 'SIMA327000770.pdf', title: 'Cargo Supervision' }],
  },
  IX: {
    airline: 'Air India Express',
    files: [
      { file: 'SIMA327000847.pdf', title: 'Ambulift' },
      { file: 'SIMA327000858.pdf', title: 'GPU + ACU + ASU' },
      { file: 'SIMA327000859.pdf', title: 'Deep Cleaning' },
    ],
  },
  BG: {
    airline: 'Biman Bangladesh',
    files: [{ file: 'SIMA327000848.pdf', title: 'Wheelchair' }],
  },
  EK: {
    airline: 'Emirates',
    files: [{ file: 'SIMA327000849.pdf', title: 'ACU / ASU / GPU / AMB' }],
  },
  BI: {
    airline: 'Royal Brunei',
    files: [
      { file: 'SIMA327000850.pdf', title: 'Wheelchair' },
      { file: 'SIMA327000851.pdf', title: 'Crew / Pax Coach' },
      { file: 'SIMA327000852.pdf', title: 'ISTNB' },
    ],
  },
  BS: {
    airline: 'US-Bangla Airlines',
    files: [
      { file: 'SIMA327000853.pdf', title: 'Wheelchair + ACU' },
      { file: 'SIMA327000860.pdf', title: 'Pax Coach' },
    ],
  },
  SG: {
    airline: 'SpiceJet',
    files: [
      { file: 'SIMA327000854.pdf', title: 'Pax Coach' },
      { file: 'SIMA327000855.pdf', title: 'Crew Coach' },
      { file: 'SIMA327000856.pdf', title: 'Wheelchair' },
    ],
  },
  LH: {
    airline: 'Lufthansa',
    files: [
      { file: 'SIMA327000861.pdf', title: 'Security Services' },
      { file: 'SIMA327000864.pdf', title: 'Wheelchair + ACU / ASU' },
    ],
  },
  EY: {
    airline: 'Etihad Airways',
    files: [{ file: 'SIMA327000862.pdf', title: 'Wheelchair + GPU + ACU' }],
  },
  UL: {
    airline: 'SriLankan Airlines',
    files: [{ file: 'SIMA327000863.pdf', title: 'Wheelchair + Ambulift + GPU' }],
  },
};

export function normalizeAnnexureCustomerCode(customerCode?: string | null): string {
  return String(customerCode ?? '')
    .trim()
    .toUpperCase();
}

export function getAdsAnnexuresForCustomer(
  customerCode?: string | null,
): AdsAirlineAnnexureEntry | null {
  const code = normalizeAnnexureCustomerCode(customerCode);
  if (!code) return null;
  return ADS_AIRLINE_ANNEXURES[code] ?? null;
}

const ANNEXURE_INVOICE_CATEGORIES = new Set(['ADS', 'BHS', 'CUSTOM', '']);

/** True when this invoice should expose airline annexures (ADS + BHS + Custom). */
export function invoiceShowsAirlineAnnexure(
  invoiceCategory: string | undefined,
  lines?: Array<{ sourceType?: string | null }>,
  customerCode?: string | null,
): boolean {
  const cat = String(invoiceCategory ?? '')
    .trim()
    .toUpperCase();
  const fromLines = Boolean(
    lines?.some((line) => {
      const src = String(line.sourceType ?? '')
        .trim()
        .toLowerCase();
      return src === 'ads' || src === 'equipment' || src === 'manpower' || src === 'custom';
    }),
  );
  if (!ANNEXURE_INVOICE_CATEGORIES.has(cat) && !fromLines) return false;
  return Boolean(getAdsAnnexuresForCustomer(customerCode));
}

export function annexurePublicUrl(file: string): string {
  return `${ADS_ANNEXURE_PUBLIC_DIR}/${encodeURIComponent(file)}`;
}

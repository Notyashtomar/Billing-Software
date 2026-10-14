export const RAF_ADHOC_DEFAULT_VALID_FROM = '2026-03-01';
export const RAF_ADHOC_DEFAULT_VALID_TO = '2027-03-31';
export const RAF_ADHOC_ALL_STATIONS = '*';

export type RafAdhocItemKind = 'equipment' | 'manpower' | 'service';

export type RafAdhocParsedRow = {
  itemKind: RafAdhocItemKind;
  label: string;
  remarks: string;
  uom: string;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  percentValue?: number;
};

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.replace(/\r\n|\r/g, '\n').trim();
  if (typeof value === 'object') {
    const rec = value as { text?: unknown; richText?: Array<{ text?: string }>; result?: unknown };
    if (typeof rec.text === 'string') return rec.text.replace(/\r\n|\r/g, '\n').trim();
    if (Array.isArray(rec.richText)) {
      return rec.richText
        .map((p) => String(p.text ?? ''))
        .join('')
        .replace(/\r\n|\r/g, '\n')
        .trim();
    }
    if (rec.result != null) return cellText(rec.result);
  }
  return String(value).trim();
}

function collapseLabel(raw: string): string {
  return raw.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMoneyOrPercent(raw: unknown): { amount?: number; percent?: number } {
  if (typeof raw === 'number' && Number.isFinite(raw)) return { amount: raw };
  const text = cellText(raw);
  if (!text) return {};
  if (text.includes('%')) {
    const n = Number(text.replace(/%/g, '').trim());
    return Number.isFinite(n) ? { percent: n } : {};
  }
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? { amount: n } : {};
}

function isSectionHeader(col2: string, col5: string): boolean {
  const name = col2.toUpperCase();
  return (
    (name === 'EQUIPMENTS' || name === 'SERVICES') &&
    /domestic/i.test(col5)
  );
}

function isBannerRow(col2: string, hasPrice: boolean): boolean {
  if (hasPrice) return false;
  const t = col2.toLowerCase();
  return (
    t.includes('passenger/terminal') ||
    t.includes('miscellaneous services') ||
    t === 'uld storage (all type of ulds / pallets)'
  );
}

function classifyKind(label: string, section: RafAdhocItemKind): RafAdhocItemKind {
  const key = label.toLowerCase();
  if (key.includes('manpower') || key.includes('floor walker') || key.includes('welcome staff')) {
    return 'manpower';
  }
  return section;
}

/**
 * Parse Sheet1 of adhoc_rate_raf_2026: skip first column, skip headers / banners.
 */
export function parseRafAdhocSheetRows(rows: unknown[][]): RafAdhocParsedRow[] {
  let section: RafAdhocItemKind = 'equipment';
  const out: RafAdhocParsedRow[] = [];

  for (const row of rows) {
    const col1 = collapseLabel(cellText(row[0]));
    const col2 = collapseLabel(cellText(row[1]));
    const remarks = collapseLabel(cellText(row[2]));
    const uom = collapseLabel(cellText(row[3]));
    const col5Text = cellText(row[4]);
    const inr = parseMoneyOrPercent(row[4]);
    const usd = parseMoneyOrPercent(row[5]);
    const hasPrice =
      inr.amount != null || usd.amount != null || inr.percent != null || usd.percent != null;
    const bannerText = `${col1} ${col2}`.toLowerCase();

    if (!col2 && !hasPrice) {
      if (bannerText.includes('passenger/terminal')) section = 'service';
      continue;
    }
    if (isSectionHeader(col2, col5Text)) {
      if (col2.toUpperCase() === 'EQUIPMENTS') section = 'equipment';
      continue;
    }
    if (isBannerRow(col2, hasPrice) || (!hasPrice && bannerText.includes('miscellaneous'))) {
      if (bannerText.includes('passenger/terminal')) section = 'service';
      continue;
    }
    if (!col2 || !hasPrice) continue;

    const percentValue = inr.percent ?? usd.percent;
    out.push({
      itemKind: classifyKind(col2, section),
      label: col2,
      remarks,
      uom: uom || 'Per service',
      unitPriceINR: inr.amount,
      unitPriceUSD: usd.amount,
      percentValue,
    });
  }

  return out;
}

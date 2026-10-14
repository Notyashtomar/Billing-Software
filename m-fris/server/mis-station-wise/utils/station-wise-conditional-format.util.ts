/**
 * MAA bird-report conditional formatting — single source for Excel + UI preview.
 *
 * Source workbook (JAN26):
 * - BI:BZ  = 1      → green fill / dark green text
 * - CA     > 0      → green fill / dark green text
 * - CB:CE  > 0      → light blue fill / navy text
 * - CG:CY  > 0      → green fill / dark green text
 * - DC:DU  > 0      → pale yellow fill / red text
 * - DW:EJ  > 0      → pink fill / purple text
 * - BH     contains "GT ADDED" → yellow fill / orange text (x14 rule)
 */

export type StationWiseCfOperator = 'equal' | 'greaterThan' | 'containsText';

export type StationWiseCfRule = {
  id: string;
  label: string;
  /** Inclusive Excel column letters, e.g. BI … BZ */
  fromCol: string;
  toCol: string;
  operator: StationWiseCfOperator;
  /** Compared value (1 / 0 / "GT ADDED"). */
  value: number | string;
  /** ARGB without leading # — ExcelJS style. */
  fillArgb: string;
  fontArgb: string;
  /** Excel CF priority (lower = higher priority in MAA). */
  priority: number;
};

export type StationWiseCellHighlight = {
  /** CSS #RRGGBB for preview UI */
  backgroundColor: string;
  color: string;
  ruleId: string;
};

export const STATION_WISE_CF_RULES: StationWiseCfRule[] = [
  {
    id: 'gt-buckets-eq1',
    label: 'Ground-time saved buckets (10-min flags)',
    fromCol: 'BI',
    toCol: 'BZ',
    operator: 'equal',
    value: 1,
    fillArgb: 'FFC6EFCE',
    fontArgb: 'FF006100',
    priority: 7,
  },
  {
    id: 'gt-overflow-gt0',
    label: 'GT saved overflow (≥ 3h)',
    fromCol: 'CA',
    toCol: 'CA',
    operator: 'greaterThan',
    value: 0,
    fillArgb: 'FFC6EFCE',
    fontArgb: 'FF006100',
    priority: 6,
  },
  {
    id: 'otp-flags-gt0',
    label: 'OTP / delay flags',
    fromCol: 'CB',
    toCol: 'CE',
    operator: 'greaterThan',
    value: 0,
    fillArgb: 'FFDDEBF7',
    fontArgb: 'FF002060',
    priority: 5,
  },
  {
    id: 'gha-time-buckets-gt0',
    label: 'GHA delay time buckets',
    fromCol: 'CG',
    toCol: 'CY',
    operator: 'greaterThan',
    value: 0,
    fillArgb: 'FFC6EFCE',
    fontArgb: 'FF006100',
    priority: 3,
  },
  {
    id: 'non-gha-time-buckets-gt0',
    label: 'Non-GHA delay time buckets',
    fromCol: 'DC',
    toCol: 'DU',
    operator: 'greaterThan',
    value: 0,
    fillArgb: 'FFFEFFCD',
    fontArgb: 'FFC00000',
    priority: 2,
  },
  {
    id: 'final-report-gt0',
    label: 'Final report flags',
    fromCol: 'DW',
    toCol: 'EJ',
    operator: 'greaterThan',
    value: 0,
    fillArgb: 'FFFFDDFF',
    fontArgb: 'FF800080',
    priority: 1,
  },
  {
    id: 'gt-added',
    label: 'GT ADDED',
    fromCol: 'BH',
    toCol: 'BH',
    operator: 'containsText',
    value: 'GT ADDED',
    fillArgb: 'FFFFFFC9',
    fontArgb: 'FFFFC000',
    priority: 4,
  },
];

export function excelColToNumber(letter: string): number {
  const s = String(letter ?? '')
    .trim()
    .toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 65 || code > 90) return 0;
    n = n * 26 + (code - 64);
  }
  return n;
}

export function argbToCssHex(argb: string): string {
  const raw = String(argb ?? '')
    .trim()
    .replace(/^#/, '')
    .toUpperCase();
  if (raw.length === 8) return `#${raw.slice(2)}`;
  if (raw.length === 6) return `#${raw}`;
  return '#000000';
}

function columnInRule(letter: string, rule: StationWiseCfRule): boolean {
  const n = excelColToNumber(letter);
  if (!n) return false;
  return n >= excelColToNumber(rule.fromCol) && n <= excelColToNumber(rule.toCol);
}

/** Parse preview/Excel display value into a comparable number when possible. */
export function parseCfNumeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value).trim();
  if (!s || s === '-') return null;
  if (/^0(?:\.0+)?$/.test(s)) return 0;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return null;
}

export function valueMatchesCfRule(
  value: unknown,
  rule: StationWiseCfRule,
): boolean {
  if (rule.operator === 'containsText') {
    const needle = String(rule.value);
    const hay = String(value ?? '');
    return hay.toUpperCase().includes(needle.toUpperCase());
  }
  const num = parseCfNumeric(value);
  if (num == null) return false;
  if (rule.operator === 'equal') return num === Number(rule.value);
  if (rule.operator === 'greaterThan') return num > Number(rule.value);
  return false;
}

/**
 * Resolve highlight for one cell (first matching rule by priority ascending =
 * MAA order: lower priority number wins when overlapping — ranges don't overlap).
 */
export function resolveStationWiseCellHighlight(
  letter: string,
  value: unknown,
): StationWiseCellHighlight | null {
  const col = String(letter ?? '')
    .trim()
    .toUpperCase();
  if (!col) return null;
  const candidates = STATION_WISE_CF_RULES.filter((r) => columnInRule(col, r)).sort(
    (a, b) => a.priority - b.priority,
  );
  for (const rule of candidates) {
    if (!valueMatchesCfRule(value, rule)) continue;
    return {
      backgroundColor: argbToCssHex(rule.fillArgb),
      color: argbToCssHex(rule.fontArgb),
      ruleId: rule.id,
    };
  }
  return null;
}

/** letter → highlight for a full evaluated row (display values). */
export function resolveStationWiseRowHighlights(
  cells: Record<string, string | number | null | undefined>,
): Record<string, StationWiseCellHighlight> {
  const out: Record<string, StationWiseCellHighlight> = {};
  for (const [letter, value] of Object.entries(cells)) {
    const hit = resolveStationWiseCellHighlight(letter, value);
    if (hit) out[letter] = hit;
  }
  return out;
}

export function stationWiseCfRulesForApi(): Array<{
  id: string;
  label: string;
  fromCol: string;
  toCol: string;
  operator: StationWiseCfOperator;
  value: number | string;
  fill: string;
  color: string;
}> {
  return STATION_WISE_CF_RULES.map((r) => ({
    id: r.id,
    label: r.label,
    fromCol: r.fromCol,
    toCol: r.toCol,
    operator: r.operator,
    value: r.value,
    fill: argbToCssHex(r.fillArgb),
    color: argbToCssHex(r.fontArgb),
  }));
}

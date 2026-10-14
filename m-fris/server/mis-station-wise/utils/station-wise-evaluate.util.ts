import { GHA_CODE_COLS, bucketThresholdExcel } from './station-wise-formulas.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import { excelTimeToHm, parseToYmd } from './station-wise-map-fhr.util';

export type EvaluatedFormulaCells = Record<string, string | number>;

const DAY = 1;
const TEN_MIN = bucketThresholdExcel(0);

function asTime(v: number | ''): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Excel blank time/date compares as 0 — needed for EB / FA = EM+EN+ES. */
function excelTimeOrZero(v: number | null): number {
  return v ?? 0;
}

function dateRank(display: string): string {
  return parseToYmd(display) ?? '';
}

function datesEqual(a: string, b: string): boolean {
  return dateRank(a) === dateRank(b);
}

function dateGreater(a: string, b: string): boolean {
  return dateRank(a) > dateRank(b);
}

function parseLeadingCode(reason: string): number {
  const m = /^(\d{2})/.exec(String(reason ?? '').trim());
  return m ? Number(m[1]) : 0;
}

function fmtTime(v: number | string | null | undefined): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '-';
  // Excel day-fraction → hh:mm:ss-ish for display
  const totalSec = Math.round(Math.abs(v) * 24 * 3600);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  if (hh >= 24) return String(v);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Show numeric / text zero as "-" (preview + Excel cached results). */
export function zeroAsDash(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    if (value === 0) return '-';
    if (Math.abs(value) > 0 && Math.abs(value) < 1.5) return fmtTime(value);
    return String(value);
  }
  const s = String(value).trim();
  if (s === '0' || /^0(?:\.0+)?$/.test(s)) return '-';
  return s;
}

function fmtCell(v: string | number | null | undefined): string {
  return zeroAsDash(v);
}

/** Delay durations: blank or zero time → "-". Keep schedule times (STA/ATA) as hh:mm. */
function delayTimeOrDash(value: number | ''): string {
  if (value === '' || value === 0) return '-';
  const hm = excelTimeToHm(value);
  if (!hm || hm === '00:00') return '-';
  return hm;
}

/** Excel formula cached result: keep text, map numeric 0 → "-". */
export function excelResultZeroAsDash(
  value: string | number | undefined,
): string | number | undefined {
  if (value === undefined || value === '') return value;
  if (typeof value === 'number' && value === 0) return '-';
  if (value === '0') return '-';
  return value;
}

/**
 * Evaluate MAA bird-report row formulas in TypeScript so the UI preview
 * shows real values (not blank / "ƒ Excel" placeholders).
 */
export function evaluateStationWiseRow(row: StationWiseInputRow): EvaluatedFormulaCells {
  const E = asTime(row.staTime);
  const G = asTime(row.stdTime);
  const I = asTime(row.ataTime);
  const K = asTime(row.atdTime);
  const N = asTime(row.actualDelay);
  const O = asTime(row.delay1);
  const Q = asTime(row.delay2);
  const S = asTime(row.delay3);
  const F = row.staDate;
  const H = row.stdDate;
  const J = row.ataDate;
  const L = row.atdDate;
  const flight = String(row.flightNo ?? '');
  const W2 = 0; // midnight sentinel
  const BF2 = DAY;
  const BG2 = DAY;

  const U = datesEqual(F, J) ? 0 : 1;
  const V = datesEqual(H, L) ? 0 : 1;

  let W: number | string = '';
  if (I == null || E == null) W = '';
  else if (U === 1) W = Math.max(0, W2 - E + I);
  else if (I > E) W = I - E;
  else W = 'Before STA';

  let X: number | string = '';
  if (K == null || G == null) X = '';
  else if (K > G) X = V === 1 ? W2 - G + K : K - G;
  else X = 'Before STD';

  let Y: number | string = '';
  if (X === 'Before STD') Y = 'Before STD';
  else if (W === 'Before STA') Y = 'LDAT';
  else if (typeof W === 'number' && typeof X === 'number') Y = W > X ? W - X : 'LDAT';
  else Y = 'LDAT';

  const Z =
    I == null
      ? 'CANC'
      : Y === 'Before STD'
        ? 1
        : Y === 'LDAT'
          ? 2
          : 'LAST';

  const AA = parseLeadingCode(row.reasonOfDelay);
  const AB = O ?? 0;
  const AC = parseLeadingCode(row.delaycode2);
  const AD = Q ?? 0;
  const AE = parseLeadingCode(row.delaycode3);
  const AF = S ?? 0;

  const out: EvaluatedFormulaCells = {
    U,
    V,
    W: typeof W === 'number' ? W : W,
    X: typeof X === 'number' ? X : X,
    Y: typeof Y === 'number' ? Y : Y,
    Z,
    AA,
    AB,
    AC,
    AD,
    AE,
    AF,
  };

  let BB = 0;
  for (const { col, code } of GHA_CODE_COLS) {
    const val =
      (AA === code ? AB : 0) + (AC === code ? AD : 0) + (AE === code ? AF : 0);
    out[col] = val;
    BB += typeof val === 'number' ? val : 0;
  }
  out.BB = BB;
  out.BC = BB > 0 ? 1 : 0;

  const BD = flight.slice(0, 4).toUpperCase();
  const BE = BD === 'CANC' ? 1 : 0;
  out.BD = BD;
  out.BE = BE;

  let BF: number | string = 0;
  let BG: number | string = 0;
  if (BE === 1) {
    BF = 0;
    BG = 0;
  } else if (E != null && G != null && I != null && K != null) {
    BF = datesEqual(H, F) ? G - E : BF2 + G - E;
    BG = datesEqual(J, L) ? K - I : BG2 + K - I;
  }
  out.BF = BF;
  out.BG = BG;

  let BH: number | string = '';
  if (typeof BF === 'number' && typeof BG === 'number') {
    if (BF > BG) BH = BF - BG;
    else if (BF === BG) BH = 0;
    else BH = 'GT ADDED';
  }
  out.BH = BH;

  // GT buckets BI–CA
  const gtCols = [
    'BI',
    'BJ',
    'BK',
    'BL',
    'BM',
    'BN',
    'BO',
    'BP',
    'BQ',
    'BR',
    'BS',
    'BT',
    'BU',
    'BV',
    'BW',
    'BX',
    'BY',
    'BZ',
    'CA',
  ];
  let gtCum = 0;
  gtCols.forEach((col, i) => {
    const thr = bucketThresholdExcel(i);
    let v = 0;
    if (col === 'CA') {
      v = BH === 'GT ADDED' ? 0 : typeof BH === 'number' && BH > thr ? 1 : 0;
    } else if (typeof BH === 'number') {
      const raw = BH < thr ? 1 : 0;
      v = Math.max(0, raw - gtCum - BE);
      gtCum += v;
    }
    out[col] = v;
  });

  out.CB = N != null && N !== 0 ? 1 : 0;
  const within =
    I != null && E != null && K != null && G != null && I <= E && K <= G ? 1 : 0;
  out.CC = Math.max(0, within - BE);
  const cd =
    typeof BG === 'number' && typeof BF === 'number' && BG <= BF ? 1 : 0;
  out.CD = Math.max(0, cd - BE - Number(out.CC));
  out.CE =
    typeof BG === 'number' && typeof BF === 'number' && BG > BF ? 1 : 0;

  // GHA delay time buckets CG–CY
  const ghaCols = [
    'CG',
    'CH',
    'CI',
    'CJ',
    'CK',
    'CL',
    'CM',
    'CN',
    'CO',
    'CP',
    'CQ',
    'CR',
    'CS',
    'CT',
    'CU',
    'CV',
    'CW',
    'CX',
    'CY',
  ];
  let ghaCum = 0;
  ghaCols.forEach((col, i) => {
    const thr = bucketThresholdExcel(i);
    let v = 0;
    if (BB === 0) v = 0;
    else if (col === 'CY') v = BB > thr ? 1 : 0;
    else {
      const raw = BB < thr ? 1 : 0;
      v = Math.max(0, raw - ghaCum);
      ghaCum += v;
    }
    out[col] = v;
  });

  out.DA = Number(out.CB) - Number(out.BC);
  const DB =
    Number(out.DA) === 1 && N != null ? Math.max(0, N - BB) : 0;
  out.DB = DB;

  const ngCols = [
    'DC',
    'DD',
    'DE',
    'DF',
    'DG',
    'DH',
    'DI',
    'DJ',
    'DK',
    'DL',
    'DM',
    'DN',
    'DO',
    'DP',
    'DQ',
    'DR',
    'DS',
    'DT',
    'DU',
  ];
  let ngCum = 0;
  ngCols.forEach((col, i) => {
    const thr = bucketThresholdExcel(i);
    let v = 0;
    if (Number(out.DA) === 0) v = 0;
    else if (col === 'DU') v = DB > thr ? 1 : 0;
    else {
      const raw = DB < thr ? 1 : 0;
      v = Math.max(0, raw - ngCum);
      ngCum += v;
    }
    out[col] = v;
  });

  const Ix = excelTimeOrZero(I);
  const Ex = excelTimeOrZero(E);
  const DW = datesEqual(J, F) && Ix > Ex ? 1 : 0;
  out.DW = DW;
  const DX =
    DW === 1 && datesEqual(H, L) && K != null && G != null && K <= G ? 1 : 0;
  out.DX = DX;
  const DY =
    DW === 1 && typeof BG === 'number' && typeof BF === 'number' && BG <= BF
      ? Math.max(0, 1 - DX)
      : 0;
  out.DY = DY;
  const DZ =
    DW === 1 && typeof BG === 'number' && typeof BF === 'number' && BG > BF
      ? Number(out.DA)
      : 0;
  out.DZ = DZ;
  out.EA = Math.max(0, DW - DX - DY - DZ);

  const arrivedBefore =
    dateGreater(F, J) || Ix < Ex || Ix === Ex ? 1 : 0;
  out.EB = Math.max(0, arrivedBefore - BE);
  const EC = Ex === Ix && datesEqual(F, J) ? 1 : 0;
  out.EC = EC;
  out.ED = Math.max(0, Number(out.EB) - EC);
  const ED = Number(out.ED);
  out.EE =
    ED === 1 && typeof BG === 'number' && typeof BF === 'number' && BG < BF
      ? 1
      : 0;
  out.EF =
    ED === 1 && typeof BG === 'number' && typeof BF === 'number' && BG === BF
      ? 1
      : 0;
  out.EG =
    ED === 1 &&
    typeof BG === 'number' &&
    typeof BF === 'number' &&
    BG > BF &&
    K != null &&
    G != null &&
    K <= G
      ? 1
      : 0;
  const EH =
    ED === 1 &&
    typeof BG === 'number' &&
    typeof BF === 'number' &&
    BG > BF &&
    K != null &&
    G != null &&
    K > G
      ? 1
      : 0;
  out.EH = EH;
  out.EI = EH === 1 ? Number(out.DA) : 0;
  out.EJ = Math.max(0, EH - Number(out.EI));

  // unused but keeps lint quiet
  void TEN_MIN;

  return out;
}

/** Flatten input + evaluated formulas to display strings for UI preview. */
export function previewCellsFromRow(
  row: StationWiseInputRow,
): Record<string, string> {
  const formulas = evaluateStationWiseRow(row);
  const cells: Record<string, string> = {
    A: String(row.serialNo || ''),
    B: row.airline,
    C: row.flightNo,
    D: row.typeCraft,
    E: excelTimeToHm(row.staTime),
    F: row.staDate,
    G: excelTimeToHm(row.stdTime),
    H: row.stdDate,
    I: excelTimeToHm(row.ataTime),
    J: row.ataDate,
    K: excelTimeToHm(row.atdTime),
    L: row.atdDate,
    M: row.delay,
    N: delayTimeOrDash(row.actualDelay),
    O: delayTimeOrDash(row.delay1),
    P: row.reasonOfDelay,
    Q: delayTimeOrDash(row.delay2),
    R: row.delaycode2,
    S: delayTimeOrDash(row.delay3),
    T: row.delaycode3,
  };
  for (const [letter, value] of Object.entries(formulas)) {
    cells[letter] = fmtCell(value);
  }
  return cells;
}

/**
 * Pure helpers for deriving normalized STA calendar strings (dd/MM/yyyy) from FHR embeds.
 * Shared by `FhrCollectionService`, scheduled-merge queries, and the one-time backfill script.
 */

export function normalizeDateDdMmYyyy(input: string): string {
  if (!input?.trim()) return '';
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}/${m}/${y}`;
  }
  const parts = s.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2].length === 4) {
    const d0 = parts[0].padStart(2, '0');
    const m0 = parts[1].padStart(2, '0');
    return `${d0}/${m0}/${parts[2]}`;
  }
  return s;
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function firstScheduleDateString(...candidates: unknown[]): string {
  for (const v of candidates) {
    if (v == null) continue;
    const s = v instanceof Date ? dateToYmd(v) : String(v).trim();
    if (s) return s;
  }
  return '';
}

function staDdMmFromEmbed(
  embed: Record<string, unknown> | null | undefined,
): string[] {
  if (!embed || typeof embed !== 'object') return [];
  const raw = firstScheduleDateString(embed.STADate, embed.staDate);
  if (!raw) return [];
  const norm = normalizeDateDdMmYyyy(String(raw));
  return norm ? [norm] : [];
}

/** Unique normalized STA dates from terminal + ramp forms (indexed field `staDates`). */
export function computeStaDatesFromEmbeds(
  terminalDetails?: Record<string, unknown> | null,
  rampDetails1?: Record<string, unknown> | null,
  rampDetails3?: Record<string, unknown> | null,
): string[] {
  const uniq = new Set<string>();
  for (const part of [terminalDetails, rampDetails1, rampDetails3]) {
    for (const d of staDdMmFromEmbed(part ?? undefined)) {
      uniq.add(d);
    }
  }
  return [...uniq];
}

export function staDatesArraysEqual(
  a: string[] | undefined | null,
  b: string[],
): boolean {
  const aa = Array.isArray(a) ? a : [];
  if (aa.length !== b.length) return false;
  const sa = [...aa].sort().join('\u0001');
  const sb = [...b].sort().join('\u0001');
  return sa === sb;
}

/** Parse `YYYY-MM-DD` into a local-midnight `Date`, or `null` if invalid. */
function parseYmdLocal(s: string): Date | null {
  const t = s?.trim();
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Add one calendar day (local). */
function addLocalDays(d: Date, delta: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + delta);
  return out;
}

/**
 * Every calendar day from `fromYmd` through `toYmd` inclusive, as **dd/MM/yyyy** strings
 * (same shape as indexed `staDates` / nested `STADate` after `normalizeDateDdMmYyyy`).
 */
export function enumerateDdMmYyyyBetweenInclusive(
  fromYmd: string,
  toYmd: string,
): string[] {
  const start = parseYmdLocal(fromYmd);
  const end = parseYmdLocal(toYmd);
  if (!start || !end || start.getTime() > end.getTime()) return [];
  const out: string[] = [];
  for (
    let cur = start;
    cur.getTime() <= end.getTime();
    cur = addLocalDays(cur, 1)
  ) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    out.push(`${day}/${m}/${y}`);
  }
  return out;
}

const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function weekdayKeyFromDate(d: Date): string {
  return WEEKDAY_KEYS[d.getDay()] ?? '';
}

/** True when at least one weekday flag is explicitly enabled in `scheduleDays`. */
function isAnyScheduleDaySelected(days: Record<string, unknown>): boolean {
  for (const key of WEEKDAY_KEYS) {
    if (isScheduleDayEnabled(days, key)) return true;
  }
  for (const key of Object.keys(days)) {
    if (isScheduleDayEnabled(days, key)) return true;
  }
  return false;
}

function isScheduleDayEnabled(
  days: Record<string, unknown>,
  weekdayKey: string,
): boolean {
  if (!weekdayKey) return false;
  const truthy = (k: string) =>
    !!k &&
    Object.prototype.hasOwnProperty.call(days, k) &&
    (days[k] === true ||
      days[k] === 1 ||
      ['1', 'true', 'yes', 'y'].includes(
        String(days[k] ?? '')
          .trim()
          .toLowerCase(),
      ));

  if (truthy(weekdayKey)) return true;

  const lower = weekdayKey.toLowerCase();
  for (const key of Object.keys(days)) {
    if (key.toLowerCase() === lower && truthy(key)) return true;
  }
  return false;
}

/** dd/MM/yyyy operating days between validity bounds where `scheduleDays` is true. */
export function enumerateOperatingScheduleDates(
  validFromDdMm: string,
  validToDdMm: string,
  scheduleDays: Record<string, unknown> | null | undefined,
): string[] {
  const fromNorm = normalizeDateDdMmYyyy(validFromDdMm);
  const toNorm = normalizeDateDdMmYyyy(validToDdMm);
  if (!fromNorm || !toNorm) return [];

  const partsFrom = fromNorm.split('/');
  const partsTo = toNorm.split('/');
  if (partsFrom.length !== 3 || partsTo.length !== 3) return [];
  const fromYmd = `${partsFrom[2]}-${partsFrom[1]}-${partsFrom[0]}`;
  const toYmd = `${partsTo[2]}-${partsTo[1]}-${partsTo[0]}`;

  const days =
    scheduleDays && typeof scheduleDays === 'object' && !Array.isArray(scheduleDays)
      ? scheduleDays
      : {};

  // Only filter by weekday when the user selected at least one operating day.
  // An all-false `scheduleDays` object (form default) means "every day in the validity range".
  const hasAnyDayFlag = isAnyScheduleDaySelected(days);
  const out: string[] = [];
  const start = parseYmdLocal(fromYmd);
  const end = parseYmdLocal(toYmd);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  for (
    let cur = start;
    cur.getTime() <= end.getTime();
    cur = addLocalDays(cur, 1)
  ) {
    const weekday = weekdayKeyFromDate(cur);
    if (hasAnyDayFlag && !isScheduleDayEnabled(days, weekday)) continue;
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    out.push(`${day}/${m}/${y}`);
  }
  return out;
}

export function ymdFromDdMmYyyy(ddMmYyyy: string): string | null {
  const norm = normalizeDateDdMmYyyy(ddMmYyyy);
  const parts = norm.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Expand dd/MM/yyyy window keys (and ISO inputs) so Mongo `$in` matches both
 * indexed `staDates` shapes stored as dd/MM/yyyy or yyyy-MM-dd.
 */
export function expandStaDateQueryVariants(dateStrings: string[]): string[] {
  const out = new Set<string>();
  for (const raw of dateStrings) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    out.add(s);
    const norm = normalizeDateDdMmYyyy(s);
    if (norm) {
      out.add(norm);
      const ymd = ymdFromDdMmYyyy(norm);
      if (ymd) out.add(ymd);
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) {
      const [, y, m, d] = iso;
      out.add(`${d}/${m}/${y}`);
    }
  }
  return [...out];
}

/**
 * Mongo filter: flights whose STA calendar falls in any of the given **dd/MM/yyyy** strings.
 * Matches indexed `staDates` plus legacy docs without `staDates` (nested `STADate` `$in`).
 * Parity with `FhrCollectionService` scheduled-merge date windows.
 */
export function fhrStaDatesRangeFilter(
  dateStrings: string[],
): Record<string, unknown> {
  if (!dateStrings.length) {
    return { _id: { $exists: false } };
  }
  const variants = expandStaDateQueryVariants(dateStrings);
  return {
    $or: [
      { staDates: { $in: variants } },
      {
        $and: [
          {
            $or: [{ staDates: { $exists: false } }, { staDates: { $size: 0 } }],
          },
            {
              $or: [
                { 'terminalDetails.STADate': { $in: variants } },
                { 'rampDetails1.STADate': { $in: variants } },
                { 'rampDetails3.STADate': { $in: variants } },
                { 'mainDetails.STADate': { $in: variants } },
                { 'mainDetails.staDate': { $in: variants } },
              ],
            },
        ],
      },
    ],
  };
}

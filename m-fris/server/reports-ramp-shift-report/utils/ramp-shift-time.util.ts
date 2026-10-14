import {
  RAMP_DAY_SHIFT_END_MINS,
  RAMP_DAY_SHIFT_START_MINS,
  type RampShiftBand,
} from '../constants/reports-ramp-shift-report.constants';

export function parseTimeToMinutes(raw: unknown): number | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const colon = t.match(/^(\d{1,2}):(\d{2})/);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || m >= 60 || h >= 24) return null;
    return h * 60 + m;
  }
  if (/^\d{3,4}$/.test(t)) {
    const p = t.length === 3;
    const h = Number(t.slice(0, p ? 1 : 2));
    const m = Number(t.slice(p ? 1 : 2));
    if (Number.isNaN(h) || Number.isNaN(m) || m >= 60 || h >= 24) return null;
    return h * 60 + m;
  }
  return null;
}

export function scheduleLabelToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d)
      return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

export function ymdToDdMmYyyy(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function matchesRampShiftMinutes(
  mins: number | null,
  shift: RampShiftBand,
): boolean {
  if (mins == null) return true;
  const inDay =
    mins >= RAMP_DAY_SHIFT_START_MINS && mins < RAMP_DAY_SHIFT_END_MINS;
  return shift === 'day' ? inDay : !inDay;
}

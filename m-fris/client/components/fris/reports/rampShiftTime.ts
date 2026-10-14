/** Day shift 05:00–17:00; night is all other times (same band as ramp non-scheduled). */

export function parseTimeToMinutes(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
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

export function matchesRampShiftMinutes(mins: number | null, shift: 'day' | 'night'): boolean {
  if (mins == null) return false;
  const inDay = mins >= 5 * 60 && mins < 17 * 60;
  return shift === 'day' ? inDay : !inDay;
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
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

export function ymdToDdMmYyyy(ymd: string): string {
  const p = ymd.split('-').map((s) => s.trim());
  if (p.length !== 3) return ymd;
  const [y, m, d] = p;
  return `${d}/${m}/${y}`;
}

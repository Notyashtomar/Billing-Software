/** Parse leading two-digit IATA delay code (01–99) from reason text. */
export function parseLeadingTwoDigitDelayCode(text: string): number | null {
  const s = String(text ?? '').trim();
  if (s.length < 2) return null;
  const pair = s.slice(0, 2);
  if (!/^\d{2}$/.test(pair)) return null;
  const n = Number(pair);
  if (n < 0 || n > 99) return null;
  return n;
}

export function delayCodeToDisplay(code: number): string {
  return String(code).padStart(2, '0');
}

export function pickReasonFromDelayEntry(o: Record<string, unknown>): string {
  const keys = [
    'reasonOfDelay',
    'ReasonofDelay',
    'ReasonOfDelay',
    'reason',
    'Reason',
  ];
  for (const k of keys) {
    const v = o[k];
    const s = String(v ?? '').trim();
    if (s !== '') return s;
  }
  return '';
}

export function pickDelayMinutesFromEntry(o: Record<string, unknown>): number {
  const keys = ['Delay', 'delay', 'DelayTime', 'delayTime'];
  for (const k of keys) {
    const raw = String(o[k] ?? '').trim();
    if (!raw) continue;
    const sign = raw.startsWith('-') ? -1 : 1;
    const t = raw.replace(/^-/, '').replace(/\./g, ':');
    const m = /^(\d{1,4}):(\d{2})$/.exec(t);
    if (!m) continue;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    return sign * (hh * 60 + mm);
  }
  return 0;
}

export function extractDelayEntriesFromMain(
  m: Record<string, unknown>,
): { code: number; minutes: number }[] {
  const out: { code: number; minutes: number }[] = [];
  const arrays = [
    m.arrivalDelays,
    m.ArrivalDelays,
    m.departureDelays,
    m.DepartureDelays,
  ];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      const reason = pickReasonFromDelayEntry(o);
      if (!reason) continue;
      const code = parseLeadingTwoDigitDelayCode(reason);
      if (code == null) continue;
      out.push({ code, minutes: pickDelayMinutesFromEntry(o) });
    }
  }
  return out;
}

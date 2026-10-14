/** Normalize to HH:mm for datetime-local time segment (24h). */
export function normalizeHHmmSegment(value: string): string {
  if (!value?.trim()) return '00:00';
  const parts = value.trim().replace(/\./g, ':').split(':').map((p) => p.trim());
  const h = (parts[0] && /^\d{1,2}$/.test(parts[0]) ? parts[0].padStart(2, '0') : '00').slice(0, 2);
  const m = (parts[1] && /^\d{1,2}$/.test(parts[1]) ? parts[1].padStart(2, '0') : '00').slice(0, 2);
  return `${h}:${m}`;
}

/** Parse `yyyy-MM-ddTHH:mm` / `yyyy-MM-ddTHH:mm:ss` into date + HH:mm. */
export function splitDatetimeLocal(s: string): { date: string; time: string } {
  const v = s?.trim() ?? '';
  if (!v) return { date: '', time: '00:00' };
  const tIdx = v.indexOf('T');
  if (tIdx >= 0) {
    const datePart = v.slice(0, tIdx);
    const rest = v.slice(tIdx + 1);
    const timeOnly = rest.split(':').slice(0, 2).join(':');
    return { date: datePart, time: normalizeHHmmSegment(timeOnly) };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { date: v, time: '00:00' };
  return { date: '', time: '00:00' };
}

/** Build `yyyy-MM-ddTHH:mm` for APIs / cancellation payloads. */
export function joinDatetimeLocal(date: string, time: string): string {
  const d = date?.trim();
  if (!d) return '';
  const t = normalizeHHmmSegment(time || '00:00');
  return `${d}T${t}`;
}

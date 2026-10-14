/** Parse `yyyy-MM-ddTHH:mm` / `yyyy-MM-ddTHH:mm:ss` into display date + time. */
export function splitIntimationDatetime(raw: string): {
  date: string;
  time: string;
} {
  const v = String(raw ?? '').trim();
  if (!v) return { date: '', time: '' };
  const tIdx = v.indexOf('T');
  if (tIdx >= 0) {
    const date = v.slice(0, tIdx);
    const timePart = v
      .slice(tIdx + 1)
      .split(':')
      .slice(0, 2)
      .join(':');
    return { date, time: timePart || '' };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { date: v, time: '' };
  return { date: '', time: '' };
}

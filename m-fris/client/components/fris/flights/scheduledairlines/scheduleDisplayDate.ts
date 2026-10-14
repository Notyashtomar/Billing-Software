/**
 * Schedule date helpers shared by the equipment / manpower forms.
 *
 * Flight rows reach these forms in mixed shapes: scheduled rows keep the raw
 * Excel `dd-MM-yyyy` / `dd/MM/yyyy` label, non-scheduled rows are normalized to
 * ISO `yyyy-MM-dd` before they hit the table. Treating an ISO string as
 * day-first produces an unusable date, so every conversion goes through here.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function pad2(value: string): string {
  return value.padStart(2, '0');
}

/** Any supported schedule date string → `dd/MM/yyyy` (empty string when unparseable). */
export function toDisplayDate(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const dateOnly = value.split('T')[0]?.trim() ?? value;

  const iso = ISO_DATE_RE.exec(dateOnly);
  if (iso) return `${pad2(iso[3]!)}/${pad2(iso[2]!)}/${iso[1]!}`;

  const parts = dateOnly.split(/[-/]/).map((p) => p.trim());
  if (parts.length !== 3) return value;
  const [d, m, y] = parts as [string, string, string];
  if (!d || !m || !y) return value;
  const year = y.length === 2 ? `20${y}` : y;
  return `${pad2(d)}/${pad2(m)}/${year}`;
}

/** Any supported schedule date string → ISO `yyyy-MM-dd` (empty string when unparseable). */
export function toIsoDate(raw: string | null | undefined): string {
  const display = toDisplayDate(raw);
  if (!display) return '';
  const [d, m, y] = display.split('/');
  if (!d || !m || !y) return '';
  return `${y}-${m}-${d}`;
}

/** `true` when the string is a real calendar date in a supported format. */
export function isValidScheduleDate(raw: string | null | undefined): boolean {
  const display = toDisplayDate(raw);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/** Combine a schedule date + `HH:mm` time into a local Date. */
export function parseScheduleDateTime(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
): Date | null {
  const display = toDisplayDate(dateStr);
  const time = String(timeStr ?? '').trim();
  if (!display || !time) return null;
  const [d, mo, y] = display.split('/').map(Number);
  const [h, min] = time.replace(/\./g, ':').split(':').map(Number);
  if (!y || !mo || !d) return null;
  const date = new Date(y, mo - 1, d, h || 0, min || 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `HH:mm` duration between two schedule date/time pairs; null when either side is unusable. */
export function scheduleDurationHhMm(
  from: Date | null,
  to: Date | null,
): string | null {
  if (!from || !to) return null;
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 0) return null;
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

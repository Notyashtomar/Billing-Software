/** Aligns with client `formatDurationBetween` in reportPdfUtils (FHR cleaning block). */

function parseDateTime(s: string | undefined): Date | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  const spaceIdx = t.indexOf(' ');
  let datePart = '';
  let timePart = '';
  if (spaceIdx > 0) {
    datePart = t.slice(0, spaceIdx).trim();
    timePart = t.slice(spaceIdx + 1).trim();
  } else if (t.includes(':')) {
    timePart = t;
  } else if (t.includes('/') || t.includes('-')) {
    datePart = t;
  }
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();
  let hour = 0;
  let min = 0;
  if (datePart) {
    const parts = datePart.split(/[-/]/).map((p) => p.trim());
    if (parts.length !== 3) return null;
    if (parts[0].length === 4 && /^19\d{2}|20\d{2}$/.test(parts[0])) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
    }
  }
  if (timePart) {
    const tp = timePart.split(':');
    if (tp.length >= 2) {
      hour = parseInt(tp[0], 10) || 0;
      min = parseInt(tp[1], 10) || 0;
    }
  }
  const d = new Date(year, month, day, hour, min, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

export function formatCleaningDurationBetween(
  fromStr: string | undefined,
  toStr: string | undefined,
): string {
  const from = parseDateTime(fromStr);
  let to = parseDateTime(toStr);
  if (!from || !to) return '';
  let diffMs = to.getTime() - from.getTime();
  const timeOnly = (s: string | undefined) =>
    s != null && s.trim().includes(':') && !s.trim().includes(' ');
  if (timeOnly(fromStr) && timeOnly(toStr) && diffMs < 0) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    diffMs = to.getTime() - from.getTime();
  }
  if (diffMs < 0) return '';
  const totalMin = Math.round(diffMs / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`;
}

function timeToMinutesCleaning(t: string | undefined): number | null {
  if (!t?.trim()) return null;
  const parts = t.trim().split(':').map(Number);
  if (parts.length < 2) return null;
  const [h, m] = parts;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function hhMmFromTotalMinutes(totalMin: number): string {
  if (totalMin < 0) return '';
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function humanMinutes(totalMin: number): string {
  if (totalMin < 0) return '';
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`;
}

/** When combined date/time strings fail to parse, use ramp HH:mm fields (same as form auto duration). */
export function formatCleaningDurationTimeOnly(
  fromTime?: string,
  toTime?: string,
): string {
  const a = timeToMinutesCleaning(fromTime);
  const b = timeToMinutesCleaning(toTime);
  if (a == null || b == null) return '';
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return humanMinutes(diff);
}

export function formatCleaningDurationBetweenHhMm(
  fromStr: string | undefined,
  toStr: string | undefined,
): string {
  const from = parseDateTime(fromStr);
  let to = parseDateTime(toStr);
  if (!from || !to) return '';
  let diffMs = to.getTime() - from.getTime();
  const timeOnly = (s: string | undefined) =>
    s != null && s.trim().includes(':') && !s.trim().includes(' ');
  if (timeOnly(fromStr) && timeOnly(toStr) && diffMs < 0) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    diffMs = to.getTime() - from.getTime();
  }
  if (diffMs < 0) return '';
  const totalMin = Math.round(diffMs / 60000);
  return hhMmFromTotalMinutes(totalMin);
}

export function formatCleaningDurationTimeOnlyHhMm(
  fromTime?: string,
  toTime?: string,
): string {
  const a = timeToMinutesCleaning(fromTime);
  const b = timeToMinutesCleaning(toTime);
  if (a == null || b == null) return '';
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return hhMmFromTotalMinutes(diff);
}

export function resolveFlightReportCleaningDuration(
  cleaningFromTime: string,
  cleaningToTime: string,
  rampStartedTime?: string,
  rampClosedTime?: string,
): string {
  const primary = formatCleaningDurationBetween(
    cleaningFromTime,
    cleaningToTime,
  );
  if (primary) return primary;
  return formatCleaningDurationTimeOnly(rampStartedTime, rampClosedTime);
}

export function resolveFlightReportCleaningDurationHhMm(
  cleaningFromTime: string,
  cleaningToTime: string,
  rampStartedTime?: string,
  rampClosedTime?: string,
): string {
  const primary = formatCleaningDurationBetweenHhMm(
    cleaningFromTime,
    cleaningToTime,
  );
  if (primary) return primary;
  return formatCleaningDurationTimeOnlyHhMm(rampStartedTime, rampClosedTime);
}

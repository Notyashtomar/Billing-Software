/** Apply Plus/Minus offset (minutes) to a wall-clock date/time (DD/MM/YYYY + HH:mm). */
export function applyScheduleEquipmentOffset(
  dateDdMmYyyy: string,
  timeHhMm: string,
  sign: string,
  minutes: number,
): { date: string; time: string } {
  const dt = parseDdMmYyyyHhMm(dateDdMmYyyy, timeHhMm);
  if (!dt) {
    return { date: dateDdMmYyyy || '', time: timeHhMm || '00:00' };
  }
  const deltaMs =
    (String(sign).trim() === 'Plus' ? 1 : -1) *
    Math.max(0, Number(minutes) || 0) *
    60_000;
  const out = new Date(dt.getTime() + deltaMs);
  return {
    date: formatDdMmYyyy(out),
    time: formatHhMm(out),
  };
}

function parseDdMmYyyyHhMm(dateStr: string, timeStr: string): Date | null {
  const dRaw = String(dateStr ?? '').trim();
  const tRaw = String(timeStr ?? '').trim();
  if (!dRaw) return null;
  const parts = dRaw.split(/[-/]/).map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [d, m, y] = parts;
  let h = 0;
  let min = 0;
  if (tRaw) {
    const tp = tRaw.replace(/\./g, ':').split(':').map((p) => Number(p.trim()));
    h = tp[0] ?? 0;
    min = tp[1] ?? 0;
  }
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDdMmYyyy(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatHhMm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type ScheduleEquipmentMilestones = {
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
};

export type ScheduleEquipmentRuleLike = {
  timeRequired?: boolean;
  option1Basis?: string;
  option1Sign?: string;
  option1Minutes?: number;
  option2Basis?: string;
  option2Sign?: string;
  option2Minutes?: number;
};

export function scheduleEquipmentWindowFromRule(
  rule: ScheduleEquipmentRuleLike,
  milestones: ScheduleEquipmentMilestones,
  defaultDate: string,
): { fromDate: string; fromTime: string; toDate: string; toTime: string } {
  const zero = { date: defaultDate, time: '00:00' };
  const option1Minutes = Math.max(0, Number(rule.option1Minutes) || 0);
  const option2Minutes = Math.max(0, Number(rule.option2Minutes) || 0);
  const useTimedWindow =
    rule.timeRequired === true || option1Minutes > 0 || option2Minutes > 0;

  if (!useTimedWindow) {
    return {
      fromDate: zero.date,
      fromTime: zero.time,
      toDate: zero.date,
      toTime: zero.time,
    };
  }

  const basisDateTime = (basis: string) => {
    const b = String(basis ?? '')
      .trim()
      .toUpperCase();
    if (b === 'ATD') {
      return {
        date: milestones.atdDate || defaultDate,
        time: milestones.atdTime || '00:00',
      };
    }
    return {
      date: milestones.ataDate || defaultDate,
      time: milestones.ataTime || '00:00',
    };
  };

  const fromBase = basisDateTime(rule.option1Basis ?? 'ATA');
  const toBase = basisDateTime(rule.option2Basis ?? 'ATD');
  const from = applyScheduleEquipmentOffset(
    fromBase.date,
    fromBase.time,
    rule.option1Sign ?? 'Minus',
    rule.option1Minutes ?? 0,
  );
  const to = applyScheduleEquipmentOffset(
    toBase.date,
    toBase.time,
    rule.option2Sign ?? 'Plus',
    rule.option2Minutes ?? 0,
  );
  return {
    fromDate: from.date,
    fromTime: from.time,
    toDate: to.date,
    toTime: to.time,
  };
}

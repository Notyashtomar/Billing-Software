import {
  matchesRampShiftMinutes,
  parseTimeToMinutes,
  scheduleLabelToYmd,
} from '@/components/fris/reports/rampShiftTime';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';

export type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';

/** Rows included on the published ramp shift report (view / print). */
export function scheduledRowsForReport(rows: RampScheduledAirlineRow[]): RampScheduledAirlineRow[] {
  return rows.filter((r) => r.checked && r.authorized);
}

/** Client fallback when API unavailable — mirrors server mapper shift rules. */
export function buildScheduledAirlinesForRamp(
  raw: unknown[],
  reportDateYmd: string,
  shift: 'day' | 'night',
): RampScheduledAirlineRow[] {
  if (!reportDateYmd || !Array.isArray(raw)) return [];
  const bySerial = new Map<string, RampScheduledAirlineRow>();

  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const wrap = item as { data?: unknown };
    const d = (wrap.data && typeof wrap.data === 'object' ? wrap.data : item) as Record<
      string,
      unknown
    >;

    const serial = String(
      d.slNo ?? d.SlNo ?? d.serialNo ?? d.SerialNo ?? '',
    ).trim();
    if (!serial) continue;
    if (d.isCancelled === true || String(d.flightStatus).toLowerCase() === 'cancelled') {
      continue;
    }

    const staD = String(d.staDate ?? d.STADate ?? d['STA Date'] ?? '').trim();
    if (scheduleLabelToYmd(staD) !== reportDateYmd) continue;

    const ataT = String(d.ataTime ?? d.ATATime ?? '').trim();
    const staT = String(d.staTime ?? d.STATime ?? '').trim();
    const ataMins = parseTimeToMinutes(ataT);
    const staMins = parseTimeToMinutes(staT);
    const hasAta = Boolean(String(d.ataDate ?? d.ATADate ?? '').trim() && ataT);
    const bandMins = hasAta && ataMins != null ? ataMins : staMins;
    if (!matchesRampShiftMinutes(bandMins, shift)) continue;

    const arr = String(d.ArrivalFltNo ?? '').trim();
    const dep = String(d.DepartureFltNo ?? '').trim();
    const flt =
      arr && dep && arr.toUpperCase() !== dep.toUpperCase()
        ? `${arr}/${dep}`
        : String(d.flightNo ?? d.FlightNo ?? dep ?? arr).trim() || '—';

    const row: RampScheduledAirlineRow = {
      id: `sch-${serial}`,
      serialNo: serial,
      checked: false,
      authorized: false,
      airline: String(d.airline ?? d.Airline ?? '').trim() || '—',
      fltNo: flt,
      reportNo: serial,
      bayArr: String(d.bayPlanned ?? '').trim() || '—',
      bayDep: String(d.bayFinal ?? '').trim() || '—',
      arrivalSta: [staD, staT].filter(Boolean).join(' ') || '—',
      arrivalEta: String(d.etaTime ?? '').trim() || '—',
      arrivalAta: [d.ataDate, ataT].filter(Boolean).join(' ') || '—',
      holdOpen: '—',
      holdClose: String(d.hClose ?? '').trim() || '—',
      diffAta1stBag: String(d.fBag ?? '').trim() || '—',
      diff1stBag: String(d.fBag ?? '').trim() || '—',
      diffLastBag: String(d.lBag ?? '').trim() || '—',
      diffLbAta: String(d.lBag ?? '').trim() || '—',
      depStd: [d.stdDate, d.stdTime].filter(Boolean).join(' ') || '—',
      depEtd: '—',
      depAtd: [d.atdDate, d.atdTime].filter(Boolean).join(' ') || '—',
      delay1: '—',
      delay1Mins: '—',
      delay2: '—',
      delay2Mins: '—',
      supvrName: '—',
      teamAtBay: '—',
      lastCargoLot: '—',
      brs: '—',
      chk: '—',
      flightStatus: String(d.flightStatus ?? '').trim() || '—',
      aircraft: String(d.aircraft ?? d.Aircraft ?? '').trim() || '—',
      isUpcoming: !ataT,
    };

    if (!bySerial.has(serial)) bySerial.set(serial, row);
  }

  return [...bySerial.values()];
}

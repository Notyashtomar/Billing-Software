import { Injectable } from '@nestjs/common';
import { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';
import {
  delayCodeToDisplay,
  extractDelayEntriesFromMain,
} from '../utils/delay-code-parse.util';

export type DelayAnalyticsFlightRow = {
  flightNo: string;
  airline: string;
  station: string;
  aircraft: string;
  delayMinutes: number;
  arrival: string;
  departure: string;
  date: string;
  serialNo: number;
};

export type DelayCodeSummary = {
  code: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  pctContribution: number;
};

export type DelayAnalyticsResponse = {
  kpis: {
    totalDelayedFlights: number;
    totalDelayMinutes: number;
    avgDelayPerFlight: number;
    topCodeByFlights: { code: string; flightCount: number } | null;
    worstAirline: { name: string; flightCount: number } | null;
    worstStation: { code: string; flightCount: number } | null;
  };
  codes: DelayCodeSummary[];
  monthlyTrend: { month: string; label: string; flights: number; minutes: number }[];
  airlineComparison: { airline: string; flights: number; minutes: number }[];
  stationComparison: { station: string; flights: number; minutes: number }[];
  hourDistribution: { hour: number; label: string; count: number }[];
  insights: {
    paretoCodesPct: number;
    paretoDelayPct: number;
    peakHour: number | null;
    repeatOffenderFlights: DelayAnalyticsFlightRow[];
  };
  meta: { fromYmd: string; toYmd: string; rowCount: number };
};

export type DelayDrilldownResponse = {
  code: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  flights: DelayAnalyticsFlightRow[];
};

type FlightBucket = {
  serialNo: number;
  flightNo: string;
  airline: string;
  airlineCode: string;
  station: string;
  aircraft: string;
  arrival: string;
  departure: string;
  dateYmd: string;
  hour: number | null;
  codes: Map<number, number>;
};

@Injectable()
export class DelayAnalyticsService {
  constructor(private readonly fhrCollectionService: FhrCollectionService) {}

  async getAnalytics(
    fromYmd: string,
    toYmd: string,
    airlineFilter?: string,
    stationFilter?: string,
  ): Promise<DelayAnalyticsResponse> {
    const dateStrings = this.ymdRangeToDdMmYyyyList(fromYmd, toYmd);
    const rows = await this.fhrCollectionService.findAllLeanForScheduledTableMerge(
      dateStrings,
    );
    const buckets = this.buildFlightBuckets(
      rows,
      airlineFilter,
      stationFilter,
    );
    return this.aggregateFromBuckets(buckets, fromYmd, toYmd, rows.length);
  }

  async getDrilldown(
    fromYmd: string,
    toYmd: string,
    codeParam: string,
    airlineFilter?: string,
    stationFilter?: string,
  ): Promise<DelayDrilldownResponse> {
    const codeNum = Number(String(codeParam ?? '').trim());
    if (Number.isNaN(codeNum) || codeNum < 0 || codeNum > 99) {
      return {
        code: delayCodeToDisplay(0),
        flightCount: 0,
        totalMinutes: 0,
        avgMinutes: 0,
        flights: [],
      };
    }
    const dateStrings = this.ymdRangeToDdMmYyyyList(fromYmd, toYmd);
    const rows = await this.fhrCollectionService.findAllLeanForScheduledTableMerge(
      dateStrings,
    );
    const buckets = this.buildFlightBuckets(
      rows,
      airlineFilter,
      stationFilter,
    );
    const code = delayCodeToDisplay(codeNum);
    const flights: DelayAnalyticsFlightRow[] = [];
    let totalMinutes = 0;
    let flightCount = 0;

    for (const b of buckets.values()) {
      const mins = b.codes.get(codeNum);
      if (mins == null) continue;
      flightCount += 1;
      totalMinutes += mins;
      flights.push({
        flightNo: b.flightNo,
        airline: b.airline || b.airlineCode,
        station: b.station,
        aircraft: b.aircraft,
        delayMinutes: mins,
        arrival: b.arrival,
        departure: b.departure,
        date: b.dateYmd,
        serialNo: b.serialNo,
      });
    }

    flights.sort((a, b) => b.delayMinutes - a.delayMinutes);

    return {
      code,
      flightCount,
      totalMinutes,
      avgMinutes: flightCount > 0 ? Math.round(totalMinutes / flightCount) : 0,
      flights: flights.slice(0, 500),
    };
  }

  private buildFlightBuckets(
    rows: Array<{
      SerialNo?: number;
      flightSerialNumber?: number;
      isCancelled?: boolean;
      mainDetails?: Record<string, unknown> | null;
      terminalDetails?: Record<string, unknown> | null;
    }>,
    airlineFilter?: string,
    stationFilter?: string,
  ): Map<number, FlightBucket> {
    const airlineNeedle = String(airlineFilter ?? '').trim();
    const stationNeedle = String(stationFilter ?? '').trim();
    const buckets = new Map<number, FlightBucket>();

    for (const row of rows) {
      if (row.isCancelled === true) continue;
      const m = (row.mainDetails ?? {}) as Record<string, unknown>;
      if (this.isFlightCancelledEmbed(m)) continue;

      const airline = String(m.Airline ?? m.airline ?? '').trim();
      const airlineCode = String(m.Arline_Code ?? m.airlineCode ?? '').trim();
      if (airlineNeedle && airlineNeedle.toLowerCase() !== 'all') {
        const n = airlineNeedle.toLowerCase();
        const match =
          airline.toLowerCase() === n ||
          airlineCode.toLowerCase() === n ||
          airline.toLowerCase().includes(n);
        if (!match) continue;
      }

      const station = String(
        m.Terminal ?? m.terminal ?? m.Route ?? m.route ?? '',
      ).trim();
      if (stationNeedle && stationNeedle.toLowerCase() !== 'all') {
        const n = stationNeedle.toLowerCase();
        if (
          station.toLowerCase() !== n &&
          !station.toLowerCase().includes(n)
        ) {
          continue;
        }
      }

      const entries = extractDelayEntriesFromMain(m);
      if (entries.length === 0) continue;

      const serial =
        Number(row.flightSerialNumber ?? row.SerialNo ?? 0) || 0;
      if (!serial) continue;

      let bucket = buckets.get(serial);
      if (!bucket) {
        const dep = String(m.DepartureFltNo ?? m.departureFltNo ?? '').trim();
        const arr = String(m.ArrivalFltNo ?? m.arrivalFltNo ?? '').trim();
        const flightNo =
          dep && arr ? `${arr}/${dep}` : dep || arr || '—';
        const dateYmd =
          this.scheduleLabelToYmd(
            String(m.ATADate ?? m.ATDDate ?? m.IPosDate ?? m.etdDate ?? ''),
          ) ?? '';
        bucket = {
          serialNo: serial,
          flightNo,
          airline,
          airlineCode,
          station: station || '—',
          aircraft: String(m.TypeCraft ?? m.Regn ?? '').trim() || '—',
          arrival: String(m.ATATime ?? '').trim(),
          departure: String(m.ATDTime ?? m.ETDtime ?? '').trim(),
          dateYmd,
          hour: this.parseHourFromTime(String(m.ATDTime ?? m.ATATime ?? '')),
          codes: new Map(),
        };
        buckets.set(serial, bucket);
      }

      for (const { code, minutes } of entries) {
        const prev = bucket.codes.get(code) ?? 0;
        bucket.codes.set(code, prev + Math.max(0, minutes));
      }
    }

    return buckets;
  }

  private aggregateFromBuckets(
    buckets: Map<number, FlightBucket>,
    fromYmd: string,
    toYmd: string,
    rowCount: number,
  ): DelayAnalyticsResponse {
    const codeFlightSets = new Map<number, Set<number>>();
    const codeMinutes = new Map<number, number>();
    const airlineFlights = new Map<string, Set<number>>();
    const airlineMinutes = new Map<string, number>();
    const stationFlights = new Map<string, Set<number>>();
    const stationMinutes = new Map<string, number>();
    const monthFlights = new Map<string, Set<number>>();
    const monthMinutes = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    const flightDelayTotals = new Map<number, number>();

    let totalDelayMinutes = 0;
    const delayedFlightSerials = new Set<number>();

    for (const b of buckets.values()) {
      if (b.codes.size === 0) continue;
      delayedFlightSerials.add(b.serialNo);
      let flightMins = 0;
      for (const mins of b.codes.values()) flightMins += mins;
      flightDelayTotals.set(b.serialNo, flightMins);
      totalDelayMinutes += flightMins;

      const al = b.airline || b.airlineCode || 'Unknown';
      const st = b.station || '—';
      const mk = b.dateYmd.length >= 7 ? b.dateYmd.slice(0, 7) : '';

      if (!airlineFlights.has(al)) airlineFlights.set(al, new Set());
      airlineFlights.get(al)!.add(b.serialNo);
      airlineMinutes.set(al, (airlineMinutes.get(al) ?? 0) + flightMins);

      if (!stationFlights.has(st)) stationFlights.set(st, new Set());
      stationFlights.get(st)!.add(b.serialNo);
      stationMinutes.set(st, (stationMinutes.get(st) ?? 0) + flightMins);

      if (mk) {
        if (!monthFlights.has(mk)) monthFlights.set(mk, new Set());
        monthFlights.get(mk)!.add(b.serialNo);
        monthMinutes.set(mk, (monthMinutes.get(mk) ?? 0) + flightMins);
      }

      if (b.hour != null) {
        hourCounts.set(b.hour, (hourCounts.get(b.hour) ?? 0) + 1);
      }

      for (const [code, mins] of b.codes) {
        if (!codeFlightSets.has(code)) codeFlightSets.set(code, new Set());
        codeFlightSets.get(code)!.add(b.serialNo);
        codeMinutes.set(code, (codeMinutes.get(code) ?? 0) + mins);
      }
    }

    const totalDelayedFlights = delayedFlightSerials.size;
    const codes: DelayCodeSummary[] = [];
    for (const [code, serials] of codeFlightSets) {
      const flightCount = serials.size;
      const totalMinutes = codeMinutes.get(code) ?? 0;
      codes.push({
        code: delayCodeToDisplay(code),
        flightCount,
        totalMinutes,
        avgMinutes:
          flightCount > 0 ? Math.round(totalMinutes / flightCount) : 0,
        pctContribution:
          totalDelayMinutes > 0
            ? Math.round((totalMinutes / totalDelayMinutes) * 1000) / 10
            : 0,
      });
    }
    codes.sort((a, b) => b.flightCount - a.flightCount);

    const topCode = codes[0] ?? null;
    let worstAirline: { name: string; flightCount: number } | null = null;
    for (const [name, set] of airlineFlights) {
      const c = set.size;
      if (!worstAirline || c > worstAirline.flightCount) {
        worstAirline = { name, flightCount: c };
      }
    }
    let worstStation: { code: string; flightCount: number } | null = null;
    for (const [code, set] of stationFlights) {
      const c = set.size;
      if (!worstStation || c > worstStation.flightCount) {
        worstStation = { code, flightCount: c };
      }
    }

    const monthlyTrend = [...monthFlights.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, set]) => ({
        month,
        label: month,
        flights: set.size,
        minutes: monthMinutes.get(month) ?? 0,
      }));

    const airlineComparison = [...airlineFlights.entries()]
      .map(([airline, set]) => ({
        airline,
        flights: set.size,
        minutes: airlineMinutes.get(airline) ?? 0,
      }))
      .sort((a, b) => b.flights - a.flights)
      .slice(0, 12);

    const stationComparison = [...stationFlights.entries()]
      .map(([station, set]) => ({
        station,
        flights: set.size,
        minutes: stationMinutes.get(station) ?? 0,
      }))
      .sort((a, b) => b.flights - a.flights)
      .slice(0, 12);

    const hourDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      count: hourCounts.get(hour) ?? 0,
    }));

    let paretoCodesPct = 0;
    let paretoDelayPct = 0;
    if (codes.length > 0) {
      const topN = Math.max(1, Math.ceil(codes.length * 0.2));
      const topCodes = codes.slice(0, topN);
      const topFlightSum = topCodes.reduce((s, c) => s + c.flightCount, 0);
      const allFlightSum = codes.reduce((s, c) => s + c.flightCount, 0);
      const topMinSum = topCodes.reduce((s, c) => s + c.totalMinutes, 0);
      paretoCodesPct =
        allFlightSum > 0
          ? Math.round((topFlightSum / allFlightSum) * 1000) / 10
          : 0;
      paretoDelayPct =
        totalDelayMinutes > 0
          ? Math.round((topMinSum / totalDelayMinutes) * 1000) / 10
          : 0;
    }

    let peakHour: number | null = null;
    let peakCount = 0;
    for (const [h, c] of hourCounts) {
      if (c > peakCount) {
        peakCount = c;
        peakHour = h;
      }
    }

    const repeatOffenderFlights: DelayAnalyticsFlightRow[] = [];
    for (const b of buckets.values()) {
      const total = flightDelayTotals.get(b.serialNo) ?? 0;
      if (total < 120) continue;
      repeatOffenderFlights.push({
        flightNo: b.flightNo,
        airline: b.airline || b.airlineCode,
        station: b.station,
        aircraft: b.aircraft,
        delayMinutes: total,
        arrival: b.arrival,
        departure: b.departure,
        date: b.dateYmd,
        serialNo: b.serialNo,
      });
    }
    repeatOffenderFlights.sort((a, b) => b.delayMinutes - a.delayMinutes);

    return {
      kpis: {
        totalDelayedFlights,
        totalDelayMinutes,
        avgDelayPerFlight:
          totalDelayedFlights > 0
            ? Math.round(totalDelayMinutes / totalDelayedFlights)
            : 0,
        topCodeByFlights: topCode
          ? { code: topCode.code, flightCount: topCode.flightCount }
          : null,
        worstAirline,
        worstStation,
      },
      codes,
      monthlyTrend,
      airlineComparison,
      stationComparison,
      hourDistribution,
      insights: {
        paretoCodesPct,
        paretoDelayPct,
        peakHour,
        repeatOffenderFlights: repeatOffenderFlights.slice(0, 10),
      },
      meta: { fromYmd, toYmd, rowCount },
    };
  }

  private ymdRangeToDdMmYyyyList(fromYmd: string, toYmd: string): string[] {
    const list: string[] = [];
    const cur = new Date(`${fromYmd}T00:00:00Z`);
    const endMs = new Date(`${toYmd}T00:00:00Z`).getTime();
    while (cur.getTime() <= endMs) {
      const d = String(cur.getUTCDate()).padStart(2, '0');
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const y = cur.getUTCFullYear();
      list.push(`${d}/${m}/${y}`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return list;
  }

  private scheduleLabelToYmd(label: string): string | null {
    const raw = String(label ?? '').trim();
    if (!raw) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parts = raw.split(/[/-]/).map((p) => p.trim());
    if (parts.length === 3 && parts[2]?.length === 4) {
      const d = Number(parts[0]);
      const mo = Number(parts[1]);
      const y = Number(parts[2]);
      if (!d || !mo || !y) return null;
      const dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d)
        return null;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  private isFlightCancelledEmbed(m: Record<string, unknown>): boolean {
    if (m.flightCancelled === true) return true;
    if (
      String(m.departureStatus ?? '')
        .trim()
        .toLowerCase() === 'cancelled'
    ) {
      return true;
    }
    const arr = String(m.ArrivalFltNo ?? m.arrivalFltNo ?? '').toUpperCase();
    const dep = String(m.DepartureFltNo ?? m.departureFltNo ?? '').toUpperCase();
    return arr.includes('CANC') || dep.includes('CANC');
  }

  private parseHourFromTime(t: string): number | null {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    return h >= 0 && h <= 23 ? h : null;
  }
}

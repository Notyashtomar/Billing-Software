import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MainDetails,
  MainDetailsDocument,
} from '../main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsDocument,
} from '../terminal-details/schema/terminal-details.schema';
import {
  RampDetails3,
  RampDetails3Document,
} from '../ramp-details-3/schema/ramp-details-3.schema';

/** Matches dashboard JSON / `generate_bird_dashboard_json.py` daily rows. */
export type AtaStaDailyRowDto = {
  date: string;
  ataOnOrBeforeSta: number;
  ataAfterSta: number;
  netStaDeviationMinutes: number;
  flightsPairedInDeviation: number;
};

const MONTH_KEY = (y: number, m: number) => {
  const mon = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return `${mon[m - 1] ?? 'JAN'}${String(y).slice(-2)}`;
};

function nonEmpty(s: unknown): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Parse dd/mm/yyyy or YYYY-MM-DD. */
function parseDateFlexible(raw: string | undefined): Date | null {
  const s = nonEmpty(raw);
  if (!s) return null;
  const a = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (a) {
    const d = parseInt(a[1], 10);
    const mo = parseInt(a[2], 10);
    const y = parseInt(a[3], 10);
    const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
    if (
      Number.isNaN(dt.getTime()) ||
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo - 1 ||
      dt.getDate() !== d
    )
      return null;
    return dt;
  }
  const b = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (b) {
    const y = parseInt(b[1], 10);
    const mo = parseInt(b[2], 10);
    const d = parseInt(b[3], 10);
    const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }
  return null;
}

function parseTime(raw: string | undefined): { h: number; mi: number } | null {
  const s = nonEmpty(raw);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, mi };
}

function combineLocal(
  d: Date,
  t: { h: number; mi: number } | null,
): Date | null {
  if (!t) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.mi, 0, 0);
}

const MON_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function dayLabelForCalendar(
  anchorMonth: number,
  y: number,
  dayOfMonth: number,
) {
  const d = new Date(y, anchorMonth - 1, dayOfMonth, 0, 0, 0, 0);
  if (
    d.getFullYear() !== y ||
    d.getMonth() !== anchorMonth - 1 ||
    d.getDate() !== dayOfMonth
  ) {
    return null;
  }
  return `${String(d.getDate()).padStart(2, '0')} ${MON_SHORT[d.getMonth()]}`;
}

type DayAgg = {
  onOr: number;
  after: number;
  net: number;
  paired: number;
};

@Injectable()
export class StaAtaDailyService {
  constructor(
    @InjectModel(RampDetails3.name)
    private readonly ramp3Model: Model<RampDetails3Document>,
    @InjectModel(MainDetails.name)
    private readonly mainDetailsModel: Model<MainDetailsDocument>,
    @InjectModel(TerminalDetails.name)
    private readonly terminalDetailsModel: Model<TerminalDetailsDocument>,
  ) {}

  /**
   * Serials that appear in more than one document (per collection).
   * `mainDetails` is expected unique; included for validation.
   */
  async getDuplicateSerialReport(): Promise<{
    rampDetails3: { serialNo: number; count: number }[];
    mainDetails: { serialNo: number; count: number }[];
    terminalDetails: { serialNo: number; count: number }[];
  }> {
    const [r3, md, term] = await Promise.all([
      this.ramp3Model.aggregate([
        { $group: { _id: '$serialNo', c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $project: { _id: 0, serialNo: '$_id', count: '$c' } },
        { $sort: { serialNo: 1 } },
      ]),
      this.mainDetailsModel.aggregate([
        { $group: { _id: '$SerialNo', c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $project: { _id: 0, serialNo: '$_id', count: '$c' } },
      ]),
      this.terminalDetailsModel.aggregate([
        { $group: { _id: '$serialNo', c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $project: { _id: 0, serialNo: '$_id', count: '$c' } },
      ]),
    ]);
    return {
      rampDetails3: r3,
      mainDetails: md,
      terminalDetails: term,
    };
  }

  private async loadLatestRamp3BySerial(windowMatch?: any) {
    const pipeline: any[] = [];
    if (windowMatch) {
      pipeline.push({ $match: windowMatch });
    }
    pipeline.push(
      { $sort: { updatedAt: -1 } },
      { $group: { _id: '$serialNo', doc: { $first: '$$ROOT' } } },
    );
    const rows = await this.ramp3Model.aggregate(pipeline).exec();
    return rows as { _id: number; doc: RampDetails3 }[];
  }

  /**
   * Net Σ(ATA−STA) minutes per local calendar day (keyed by **STA date** of the movement),
   * for flights with both scheduled (STA) and actual (ATA) times.
   * Priority: latest rampDetails3 per serial, then mainDetails+terminalDetails.
   */
  async getMonthDailyNet(
    year: number,
    month: number, // 1–12
  ): Promise<{
    year: number;
    month: number;
    monthKey: string;
    sources: {
      ramp3Pairs: number;
      mainTerminalPairs: number;
    };
    daily: AtaStaDailyRowDto[];
  }> {
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException('Valid year and month (1–12) are required');
    }

    const byDay = new Map<number, DayAgg>();
    const seen = new Set<string>();
    const sources = { ramp3Pairs: 0, mainTerminalPairs: 0 };

    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const ensureDay = (dd: number): DayAgg => {
      let a = byDay.get(dd);
      if (!a) {
        a = { onOr: 0, after: 0, net: 0, paired: 0 };
        byDay.set(dd, a);
      }
      return a;
    };

    const addIfNew = (
      key: string,
      sta: Date,
      ata: Date,
      staDay: Date,
    ): boolean => {
      if (seen.has(key)) return false;
      if (staDay.getFullYear() !== year || staDay.getMonth() + 1 !== month) {
        return false;
      }
      seen.add(key);
      const d = staDay.getDate();
      const diff = Math.round((ata.getTime() - sta.getTime()) / 60000);
      const agg = ensureDay(d);
      agg.paired += 1;
      agg.net += diff;
      if (ata.getTime() <= sta.getTime()) agg.onOr += 1;
      else agg.after += 1;
      return true;
    };

    // Window: [month-2, month+1] to catch flights updated slightly outside the month
    const fromDate = new Date(year, month - 3, 1);
    const toDate = new Date(year, month, 1);
    const windowMatch = { updatedAt: { $gte: fromDate, $lt: toDate } };

    // 1) Ramp 3 (latest per serial)
    const r3 = await this.loadLatestRamp3BySerial(windowMatch);
    for (const { _id: serial, doc } of r3) {
      if (serial == null || Number.isNaN(Number(serial))) continue;
      const sDate = parseDateFlexible(doc.STADate);
      const aDate = parseDateFlexible(doc.ATADate);
      const sTime = parseTime(doc.STATime);
      const aTime = parseTime(doc.ATATime);
      if (!sDate || !aDate || !sTime || !aTime) continue;
      const sta = combineLocal(sDate, sTime);
      const ata = combineLocal(aDate, aTime);
      if (!sta || !ata) continue;
      const key = `${Number(serial)}|${ymd(sDate)}`;
      if (addIfNew(key, sta, ata, sDate)) sources.ramp3Pairs += 1;
    }

    // 2) mainDetails + terminal (STA from terminal, ATA from main)
    const terminals = await this.terminalDetailsModel
      .find(windowMatch)
      .select({ serialNo: 1, STATime: 1, STADate: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    const termBy = new Map<number, (typeof terminals)[number]>();
    for (const t of terminals) {
      const n = t.serialNo;
      if (n == null) continue;
      if (!termBy.has(n)) termBy.set(n, t);
    }

    const mains = await this.mainDetailsModel
      .find(windowMatch)
      .select({
        SerialNo: 1,
        ataDate: 1,
        ataTime: 1,
        updatedAt: 1,
      })
      .lean()
      .exec();

    for (const m of mains) {
      const sn = m.SerialNo;
      if (sn == null) continue;
      const term = termBy.get(sn);
      if (!term) continue;
      const aDate = parseDateFlexible(String(m.ATADate ?? '') || undefined);
      const sDate = parseDateFlexible(String(term.STADate ?? '') || undefined);
      if (!aDate || !sDate) continue;
      const sTime = parseTime(String(term.STATime ?? ''));
      const aTime = parseTime(String(m.ATATime ?? ''));
      if (!sTime || !aTime) continue;
      const sta = combineLocal(sDate, sTime);
      const ata = combineLocal(aDate, aTime);
      if (!sta || !ata) continue;
      const key = `${Number(sn)}|${ymd(sDate)}`;
      if (addIfNew(key, sta, ata, sDate)) sources.mainTerminalPairs += 1;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const daily: AtaStaDailyRowDto[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const label = dayLabelForCalendar(month, year, d);
      if (!label) continue;
      const agg = byDay.get(d) ?? {
        onOr: 0,
        after: 0,
        net: 0,
        paired: 0,
      };
      daily.push({
        date: label,
        ataOnOrBeforeSta: agg.onOr,
        ataAfterSta: agg.after,
        netStaDeviationMinutes: agg.net,
        flightsPairedInDeviation: agg.paired,
      });
    }

    return {
      year,
      month,
      monthKey: MONTH_KEY(year, month),
      sources,
      daily,
    };
  }
}

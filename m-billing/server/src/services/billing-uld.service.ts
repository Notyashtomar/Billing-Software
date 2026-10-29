import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StationScope, type StationScopeContext } from '../common/station-scope';
import { BillingUldSheet } from '../schemas/billing.schemas';
import { parseUldWorkbook, type UldAirlineSheet, type UldWorkbookKind } from './uld-workbook.parser';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function uldMonthLabel(month: string): string {
  const [year, mm] = month.split('-');
  const index = Number(mm) - 1;
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${year}` : month;
}

@Injectable()
export class BillingUldService {
  constructor(
    @InjectModel(BillingUldSheet.name)
    private readonly uldModel: Model<BillingUldSheet>,
  ) {}

  /** Re-importing a month replaces that month for this station; other months stay. */
  async importWorkbook(station: StationScopeContext, buffer?: Buffer, kind: UldWorkbookKind = 'others') {
    if (!buffer?.length) throw new BadRequestException('Choose the station ULD workbook (.xlsx).');
    const stationCode = String(StationScope.require(station));
    let parsed: UldAirlineSheet[];
    try {
      parsed = await parseUldWorkbook(buffer, kind);
    } catch {
      throw new BadRequestException('Could not read that workbook. Use the monthly ULD Excel.');
    }
    if (parsed.length === 0) {
      throw new BadRequestException(
        kind === 'ua-vs'
          ? 'No UA or VS sheets found. Name each sheet like "UA SEP 2026" or "VS MAR 25".'
          : 'No month sheets found. Name each sheet like "SEP 2026".',
      );
    }

    for (const sheet of parsed) {
      await this.uldModel.deleteMany({ stationCode, month: sheet.month, airline: sheet.airline });
    }
    await this.uldModel.insertMany(
      parsed.map((sheet) => ({
        stationCode,
        month: sheet.month,
        airline: sheet.airline,
        uldTypes: sheet.uldTypes,
        opening: sheet.opening,
        rows: sheet.rows,
      })),
    );

    const byMonth = new Map<string, { airlines: number; rows: number }>();
    for (const sheet of parsed) {
      const current = byMonth.get(sheet.month) ?? { airlines: 0, rows: 0 };
      current.airlines += 1;
      current.rows += sheet.rows.length;
      byMonth.set(sheet.month, current);
    }
    return {
      success: true,
      months: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, stats]) => ({ month, label: uldMonthLabel(month), ...stats })),
    };
  }

  async list(station: StationScopeContext, month?: string, airline?: string) {
    const stationCode = String(StationScope.require(station));
    const grouped = await this.uldModel.aggregate<{
      _id: string;
      airlines: string[];
      rows: number;
    }>([
      { $match: { stationCode } },
      {
        $group: {
          _id: '$month',
          airlines: { $addToSet: '$airline' },
          rows: { $sum: { $size: { $ifNull: ['$rows', []] } } },
        },
      },
    ]);
    const monthStats = new Map(grouped.map((row) => [row._id, { airlines: row.airlines, rows: row.rows }]));
    const available = [...monthStats.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, stats]) => ({
        month: key,
        label: uldMonthLabel(key),
        airlines: stats.airlines.length,
        rows: stats.rows,
      }));

    const selectedMonth = month && monthStats.has(month) ? month : available[0]?.month;
    if (!selectedMonth) return { success: true, months: available, month: null, airlines: [], sheet: null };

    const names = (monthStats.get(selectedMonth)?.airlines ?? []).slice().sort((a, b) => a.localeCompare(b));
    const selectedAirline = airline && names.includes(airline) ? airline : names[0];
    const sheet = selectedAirline
      ? await this.uldModel.findOne({ stationCode, month: selectedMonth, airline: selectedAirline }).lean()
      : null;

    return {
      success: true,
      months: available,
      month: selectedMonth,
      airlines: names,
      sheet: sheet
        ? {
            airline: sheet.airline,
            uldTypes: sheet.uldTypes,
            opening: sheet.opening,
            rows: sheet.rows,
          }
        : null,
    };
  }
}

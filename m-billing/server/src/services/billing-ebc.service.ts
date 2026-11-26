import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StationScope, type StationScopeContext } from '../common/station-scope';
import { BillingEbcCollection } from '../schemas/billing.schemas';
import { BillingSourcesQueryDto } from '../dto/billing-sources-query.dto';
import { preparationSourceIdentity } from '../utils/preparation-source-identity.util';
import { queryParamToYmd } from '../utils/billing-date.util';
import { parseEbcFile, type EbcParsedSheet } from './ebc-workbook.parser';
import { uldMonthLabel } from './billing-uld.service';
import { BillingPreparationService } from './billing-preparation.service';
import {
  BillingSourceEnrichmentService,
  type EnrichSourceInput,
} from './sources/billing-source-enrichment.service';
@Injectable()
export class BillingEbcService {
  constructor(
    @InjectModel(BillingEbcCollection.name)
    private readonly ebcModel: Model<BillingEbcCollection>,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly preparation: BillingPreparationService,
  ) {}

  /**
   * Collection receipts as operational billing rows.
   * The airline is charged a commission on the amount collected (QP and VJ 7%, UL 5% of cash).
   */
  async listBillable(station: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');
    const stationCode = String(StationScope.require(station));
    const customerFilter = String(query.customerCode ?? '').trim().toUpperCase();

    const sheets = await this.ebcModel
      .find({ stationCode })
      .select('airline rows')
      .lean();

    const inputs: EnrichSourceInput[] = [];
    for (const sheet of sheets) {
      const airline = String(sheet.airline ?? '').trim().toUpperCase();
      if (customerFilter && airline !== customerFilter) continue;
      (sheet.rows ?? []).forEach((row, index) => {
        const date = String(row.date ?? '').slice(0, 10);
        if (!date || date < fromYmd || date > toYmd) return;
        const usageRowId = [
          'ebc',
          airline,
          date,
          row.flightNo,
          row.pnr,
          row.receiptNo,
          String(index),
        ].join('|');
        inputs.push({
          sourceType: 'ebc',
          sourceRef: {
            serialNo: String(index + 1),
            flightNo: row.flightNo,
            usageRowId,
          },
          operationalData: {
            atdDate: date,
            staDate: date,
            flightNo: row.flightNo,
            flightNoEquipmentNo: row.flightNo,
            customerCode: airline,
            customerName: airline,
            passengerName: row.passengerName,
            pnr: row.pnr,
            receiptNo: row.receiptNo,
            particular: row.chargeType || 'Excess baggage collection',
            quantity: row.quantity,
            collectedAmount: row.total,
            paymentMode: row.paymentMode,
            serviceCode: 'EBC',
          },
          customerCode: airline,
          serviceCode: 'EBC',
          atdDate: date,
          billingDate: date,
        });
      });
    }

    const rows = await this.enrichment.enrichBatch(station, inputs);

    const snapshots = await this.preparation.getIngestedSourceSnapshots(
      station,
      new Date(fromYmd),
      'ebc',
    );
    const identities = new Set(
      snapshots.map((snap) => preparationSourceIdentity(snap)).filter(Boolean),
    );
    for (const row of rows) {
      const identity = preparationSourceIdentity({
        sourceRef: row.sourceRef,
        operationalData: row.operationalData,
      });
      row.sentToPreparation = Boolean(identity && identities.has(identity));
    }
    rows.sort((a, b) => {
      const aSent = a.sentToPreparation ? 1 : 0;
      const bSent = b.sentToPreparation ? 1 : 0;
      if (aSent !== bSent) return aSent - bSent;
      return String(a.operationalData.atdDate ?? '').localeCompare(String(b.operationalData.atdDate ?? ''));
    });

    return this.enrichment.wrapResponse('ebc', rows, fromYmd, toYmd);
  }

  /** Re-importing an airline-month replaces that airline-month for the current station. */
  async importFile(station: StationScopeContext, buffer?: Buffer, fileName = '') {
    if (!buffer?.length) throw new BadRequestException('Choose the EBC collection file (.csv or .xlsx).');
    const stationCode = String(StationScope.require(station));
    let parsed: EbcParsedSheet[];
    try {
      parsed = await parseEbcFile(buffer, fileName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read that EBC file.';
      throw new BadRequestException(message);
    }
    await this.save(stationCode, parsed);
    return this.summary(parsed);
  }

  async save(stationCode: string, parsed: EbcParsedSheet[]) {
    for (const sheet of parsed) {
      await this.ebcModel.deleteMany({ stationCode, month: sheet.month, airline: sheet.airline });
    }
    if (parsed.length === 0) return;
    await this.ebcModel.insertMany(
      parsed.map((sheet) => ({
        stationCode,
        month: sheet.month,
        airline: sheet.airline,
        layout: sheet.layout,
        rows: sheet.rows,
        dailyTotals: sheet.dailyTotals,
        monthSplit: sheet.monthSplit,
      })),
    );
  }

  summary(parsed: EbcParsedSheet[]) {
    return {
      success: true,
      months: parsed.map((sheet) => ({
        month: sheet.month,
        label: uldMonthLabel(sheet.month),
        airline: sheet.airline,
        rows: sheet.rows.length,
        total: sheet.monthSplit?.total ?? null,
      })),
    };
  }

  async list(station: StationScopeContext, month?: string, airline?: string) {
    const stationCode = String(StationScope.require(station));
    const grouped = await this.ebcModel.aggregate<{
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
    if (!selectedMonth) {
      return { success: true, months: available, month: null, airlines: [], sheet: null };
    }

    const names = (monthStats.get(selectedMonth)?.airlines ?? []).slice().sort((a, b) => a.localeCompare(b));
    const selectedAirline = airline && names.includes(airline.toUpperCase()) ? airline.toUpperCase() : names[0];
    const sheet = selectedAirline
      ? await this.ebcModel.findOne({ stationCode, month: selectedMonth, airline: selectedAirline }).lean()
      : null;

    return {
      success: true,
      months: available,
      month: selectedMonth,
      airlines: names,
      sheet: sheet
        ? {
            airline: sheet.airline,
            layout: sheet.layout,
            rows: sheet.rows,
            dailyTotals: sheet.dailyTotals,
            monthSplit: sheet.monthSplit,
          }
        : null,
    };
  }
}

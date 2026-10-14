import { BadRequestException, Injectable } from '@nestjs/common';
import { RawFlightDataService } from 'src/raw-flight-data/services/raw-flight-data.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  type StationScopeContext,
} from 'src/common/station/station-scope';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  mapFhrToInvoicingFlightReportRow,
  reportDateYmd,
} from './utils/invoicing-flight-report.mapper';
import { scheduledFlightBillingWindowYmd } from 'src/billing/utils/billing-date.util';

@Injectable()
export class AdvanceInvoicingService {
  private static readonly ATD_PREFETCH_DAYS = Number(
    process.env.BILLING_SCHEDULED_ATD_PREFETCH_DAYS ?? '3',
  );
  constructor(
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  private ymdToDdMmYyyy(ymd: string): string {
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
    const [y, m, d] = parts;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  private addDaysYmd(ymd: string, delta: number): string {
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    dt.setDate(dt.getDate() + delta);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  private queryParamToYmd(input?: string): string | null {
    const s = String(input ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
    }
    const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) {
      return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
    }
    return null;
  }

  async listScheduledFlightReportData(
    params: {
      from: string;
      to: string;
      dateBasis: 'schedule-date' | 'atd-date' | 'exported-date';
      dataMode: 'flight-report' | 'equipment-manpower';
      customerCode?: string;
    },
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    if (params.dataMode !== 'flight-report') {
      return {
        success: true,
        data: { rows: [] as Record<string, string | boolean>[] },
      };
    }

    const fromYmd = this.queryParamToYmd(params.from);
    const toYmd = this.queryParamToYmd(params.to);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException(
        'Invalid date range. Use yyyy-MM-dd or dd/MM/yyyy.',
      );
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException('From date must be on or before To date.');
    }

    const fetchFromYmd =
      params.dateBasis === 'atd-date'
        ? this.addDaysYmd(fromYmd, -AdvanceInvoicingService.ATD_PREFETCH_DAYS)
        : fromYmd;
    const fetchToYmd =
      params.dateBasis === 'atd-date'
        ? this.addDaysYmd(toYmd, AdvanceInvoicingService.ATD_PREFETCH_DAYS)
        : toYmd;
    const fromDd = this.ymdToDdMmYyyy(fetchFromYmd);
    const toDd = this.ymdToDdMmYyyy(fetchToYmd);
    const daily = await this.rawFlightDataService.listDailyFromAdvance(
      fromDd,
      toDd,
      false,
      station,
    );
    const normalizedCustomerCode = String(params.customerCode ?? '')
      .trim()
      .toUpperCase();

    const serials: number[] = [];
    const dailyBySerial = new Map<number, Record<string, unknown>>();
    for (const item of daily) {
      const d = item?.data;
      if (!d || typeof d !== 'object') continue;
      const data = d as Record<string, unknown>;

      const raw = String(
        data.SlNo ??
          data.slNo ??
          data['Serial No'] ??
          data.serialNo ??
          data.SerialNo ??
          data.legacySlNo ??
          '',
      ).trim();
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      serials.push(n);
      dailyBySerial.set(n, data);
    }

    const uniqueSerials = [...new Set(serials)];
    const fhrMap =
      uniqueSerials.length > 0
        ? await this.fhrCollectionService.getLeanFhrBySerialsMap(
            uniqueSerials,
            station,
          )
        : new Map<number, Record<string, unknown>>();

    const rows: Record<string, string | boolean>[] = [];

    for (const serial of uniqueSerials) {
      const dailyData = dailyBySerial.get(serial) ?? {};
      if (normalizedCustomerCode) {
        const rowCustomerCode = String(
          dailyData.customerCode ??
            dailyData['Airline Code'] ??
            dailyData.airlineCode ??
            '',
        )
          .trim()
          .toUpperCase();
        if (rowCustomerCode && rowCustomerCode !== normalizedCustomerCode) {
          continue;
        }
      }
      const fhr = fhrMap.get(serial) ?? null;

      const atdYmd = reportDateYmd(
        (fhr?.mainDetails as Record<string, unknown> | undefined)?.ATDDate ??
          (fhr?.mainDetails as Record<string, unknown> | undefined)?.atdDate ??
          dailyData.atdDate ??
          dailyData.ATDDate,
      );
      const staYmd = reportDateYmd(
        dailyData.staDate ??
          dailyData.STADate ??
          dailyData['STA Date'] ??
          (fhr?.terminalDetails as Record<string, unknown> | undefined)
            ?.STADate,
      );
      const stdYmd = reportDateYmd(
        dailyData.stdDate ??
          dailyData.STDDate ??
          dailyData['STD Date'] ??
          (fhr?.terminalDetails as Record<string, unknown> | undefined)
            ?.STDDate,
      );
      const exportedDateYmd = reportDateYmd(
        dailyData.exportedDate ??
          dailyData['Exported Date'] ??
          dailyData.exportedOn,
      );
      const scheduleYmd = reportDateYmd(
        dailyData.scheduleDate ?? dailyData['STA Date'],
      );

      const windowYmd = scheduledFlightBillingWindowYmd(
        dailyData,
        { atdYmd, staYmd, stdYmd, exportedYmd: exportedDateYmd, scheduleYmd },
        params.dateBasis,
      );
      if (!windowYmd || windowYmd < fromYmd || windowYmd > toYmd) continue;

      const fhrSerial =
        fhr &&
        (fhr as { SerialNo?: unknown; flightSerialNumber?: unknown })
          .SerialNo != null
          ? Number(
              (fhr as { SerialNo?: unknown }).SerialNo ??
                (fhr as { flightSerialNumber?: unknown }).flightSerialNumber,
            )
          : NaN;
      const rowSerial =
        Number.isFinite(fhrSerial) && fhrSerial > 0 ? fhrSerial : serial;
      const mapped = mapFhrToInvoicingFlightReportRow(
        rowSerial,
        fhr,
        dailyData,
      );
      const exportedNav = String(
        dailyData.exportedNAV ??
          dailyData.ExportedNAV ??
          dailyData['Exported NAV'] ??
          '',
      ).trim();
      if (exportedNav) {
        mapped.exportedNav = exportedNav;
      }
      rows.push(mapped);
    }

    rows.sort((a, b) => {
      const ad = String(a.atdDate ?? '');
      const bd = String(b.atdDate ?? '');
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a.serialNumber ?? '').localeCompare(
        String(b.serialNumber ?? ''),
      );
    });

    return {
      success: true,
      data: {
        rows,
        count: rows.length,
        from: fromYmd,
        to: toYmd,
        dateBasis: params.dateBasis,
      },
    };
  }

  async exportSelectedToNav(
    serialNos: string[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const normalized = [
      ...new Set(
        serialNos
          .map((s) =>
            String(s ?? '')
              .trim()
              .replace(/^FL-/i, ''),
          )
          .filter(Boolean),
      ),
    ];
    if (normalized.length === 0) {
      throw new BadRequestException('Select at least one flight to export.');
    }

    const results: Array<{ serialNo: string; ok: boolean; error?: string }> =
      [];

    for (const serial of normalized) {
      try {
        await this.rawFlightDataService.setNavisionDataExportStatus(
          serial,
          {
            status: 'Y',
            recordType: 'flight',
          },
          station,
        );
        results.push({ serialNo: serial, ok: true });
      } catch (err: unknown) {
        results.push({
          serialNo: serial,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const failed = results.filter((r) => !r.ok);
    return {
      success: failed.length === 0,
      data: {
        exported: results.filter((r) => r.ok).length,
        failed: failed.length,
        results,
      },
    };
  }
}

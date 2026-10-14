import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { NsFhrCollectionService } from './ns-fhr-collection.service';
import { fixedStationScope } from '../../common/station/station-scope';
import { LEGACY_STATION_CODE } from '../../common/station/station.constants';
import {
  normalizeDateDdMmYyyy,
  ymdFromDdMmYyyy,
} from '../../fhr-collection/utils/sta-dates.util';
import {
  LOAD_CONTROL_SCHEMA_KEYS,
  MAIN_SCHEMA_KEYS,
  RAMP_SCHEMA_KEYS,
  REMARKS_SCHEMA_KEYS,
  TERMINAL_SCHEMA_KEYS,
} from '../../excel-import/maa-excel-mapping';

const MAA_SCOPE = fixedStationScope(LEGACY_STATION_CODE);

export type MaaNsFhrSeedOptions = {
  dryRun?: boolean;
  sheetName?: string;
  fromYmd?: string | null;
  toYmd?: string | null;
  onlySerials?: number[] | null;
};

export type MaaNsFhrSeedSummary = {
  dryRun: boolean;
  stationCode: string;
  workbook: string;
  totalRowsRead: number;
  flightsProcessed: number;
  upserted: number;
  skippedRows: number;
  rowErrors: { rowIndex: number; slNo?: string; message: string }[];
};

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (k in row && row[k] != null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  const lower = new Map(
    Object.keys(row).map((k) => [k.toLowerCase(), k] as const),
  );
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real && row[real] != null && String(row[real]).trim() !== '') {
      return String(row[real]).trim();
    }
  }
  return '';
}

function normalizeNav(raw: string): string {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (s === 'Y' || s === 'YES' || s === 'EXPORTED') return 'Yes';
  if (s === 'N' || s === 'NO' || s === '') return 'No';
  return raw.trim() || 'No';
}

function truthyFlag(raw: string): boolean {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function rowInStaWindow(
  staDateRaw: string,
  fromYmd?: string | null,
  toYmd?: string | null,
): boolean {
  if (!fromYmd && !toYmd) return true;
  const dd = normalizeDateDdMmYyyy(staDateRaw);
  const ymd = ymdFromDdMmYyyy(dd);
  if (!ymd) return false;
  if (fromYmd && ymd < fromYmd) return false;
  if (toYmd && ymd > toYmd) return false;
  return true;
}

/** Copy Excel columns that already match Mongoose embed field names. */
function pickSchemaFields(
  row: Record<string, unknown>,
  keys: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = cell(row, key);
    if (v) out[key] = v;
  }
  return out;
}

function putIfEmpty(
  target: Record<string, unknown>,
  key: string,
  value: string,
): void {
  if (!value) return;
  const cur = target[key];
  if (cur == null || String(cur).trim() === '') target[key] = value;
}

/**
 * Build full FHR embeds from Non-skd MAA flat Excel so flight-report PDF
 * can hydrate terminal / ramp / load / remarks (not just header mainDetails).
 */
function buildNsFhrSlices(
  row: Record<string, unknown>,
  SerialNo: number,
): {
  mainDetails: Record<string, unknown>;
  terminalDetails: Record<string, unknown>;
  rampDetails1: Record<string, unknown>;
  loadControlDetails: Record<string, unknown>;
  remarks: Record<string, unknown>;
  exportedNAV: string;
} {
  const flightNo = cell(row, 'FlightNo', 'flightNo', 'Regn').replace(/\.+$/, '');
  const airline = cell(row, 'Airline', 'airline', 'Operator', 'Billto');
  const airlineCode = cell(
    row,
    'Arline_Code',
    'AirlineCode',
    'airlineCode',
  ).toUpperCase();
  const route = cell(row, 'Route', 'Routing', 'routing').toUpperCase();
  const typeCraft = cell(row, 'TypeCraft', 'Aircraft', 'aircraft');
  const typeOfHandling =
    cell(row, 'TypeofHandling', 'TypeOfHandling') || 'Non-Scheduled';
  const typeOfFlight = cell(row, 'Typeofflight', 'TypeOfFlight');
  const staDate = cell(row, 'STADate', 'staDate');
  const staTime = cell(row, 'STATime', 'staTime');
  const stdDate = cell(row, 'STDDate', 'stdDate');
  const stdTime = cell(row, 'STDTime', 'stdTime');
  const exportedNAV = normalizeNav(
    cell(row, 'Nav_Data_Status', 'exportedNAV', 'Exported NAV'),
  );

  const mainDetails: Record<string, unknown> = {
    ...pickSchemaFields(row, MAIN_SCHEMA_KEYS),
    SerialNo,
    flightSerialNumber: SerialNo,
    Airline: airline || cell(row, 'Airline'),
    Arline_Code: airlineCode || cell(row, 'Arline_Code'),
    ArrivalFltNo: flightNo.toUpperCase(),
    DepartureFltNo: flightNo.toUpperCase(),
    FlightNo: flightNo.toUpperCase(),
    Regn: cell(row, 'Regn', 'regn') || flightNo,
    Route: route,
    TypeCraft: typeCraft,
    TypeofHandling: typeOfHandling,
    Typeofflight: typeOfFlight || typeOfHandling,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    ATADate: cell(row, 'ATADate', 'ataDate'),
    ATATime: cell(row, 'ATATime', 'ataTime'),
    ATDDate: cell(row, 'ATDDate', 'atdDate'),
    ATDTime: cell(row, 'ATDTime', 'atdTime'),
    etdDate: cell(row, 'ETDdate', 'ETDDate', 'etdDate'),
    ETDtime: cell(row, 'ETDtime', 'ETDTime', 'etdTime'),
    IPosDate: cell(row, 'IPosDate', 'iposDate') || staDate,
    IPosTime: cell(row, 'IPosTime', 'iposTime') || staTime,
    Terminal: cell(row, 'Terminal', 'terminalCode'),
    MTOW: cell(row, 'MTOW', 'mtow'),
    Cate_of_Flight: cell(row, 'Cate_of_Flight', 'CateofFlight'),
    ActualDelay: cell(row, 'ActualDelay', 'arrivalDelay'),
    departureStatus: cell(row, 'Delay', 'departureStatus'),
    departureDelay: cell(row, 'departureDelay'),
    aircraftBody: cell(row, 'AircraftBody', 'aircraftBody'),
    airrep: cell(row, 'airrep', 'airlineRep'),
    PAX_Airline_SignByDate: cell(
      row,
      'GH_Sign_By',
      'calrep',
      'ghRep',
      'PAX_Airline_SignByDate',
    ),
    bookingNo: cell(row, 'Booking No', 'BookingNo', 'bookingNo'),
    challanNo: cell(row, 'Challan No', 'ChallanNo', 'challanNo'),
    flightCancelled: truthyFlag(cell(row, 'fltcancelled', 'flightCancelled')),
    returnToRamp: truthyFlag(cell(row, 'Return_To_Ramp', 'returnToRamp')),
    stationBaseNightHalt: truthyFlag(
      cell(row, 'IsStationBased', 'BaseFlight', 'stationBaseNightHalt'),
    ),
    exportedNAV,
    'Exported NAV': exportedNAV,
  };

  if (cell(row, 'ActualDelay') || cell(row, 'Delay')) {
    const delayDur = cell(row, 'ActualDelay');
    const reason = cell(row, 'Delay');
    if (delayDur || reason) {
      mainDetails.arrivalDelays = [
        {
          Delay: delayDur,
          ReasonofDelay: reason,
          gh: false,
          oth: false,
        },
      ];
      mainDetails.departureDelays = [
        {
          Delay: delayDur,
          ReasonofDelay: reason,
          gh: false,
          oth: false,
        },
      ];
    }
  }

  const terminalDetails: Record<string, unknown> = {
    ...pickSchemaFields(row, TERMINAL_SCHEMA_KEYS),
    serialNo: SerialNo,
    airlinesOperator: airline,
    Airline: airline,
    FlightNo: flightNo.toUpperCase(),
    flightNo: flightNo.toUpperCase(),
    routing: route,
    TypeCraft: typeCraft,
    Typeofflight: typeOfFlight || typeOfHandling,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    IGMNo: cell(row, 'IGMNo', 'igm'),
    EGMNo: cell(row, 'EGMNo', 'egm'),
    GatePlanned: cell(row, 'GatePlanned', 'gatePlanned'),
    GateFinal: cell(row, 'GateFinal', 'gateFinal'),
    arrivalpax: cell(row, 'arrivalpax', 'passengerArrived'),
    deppax: cell(row, 'deppax', 'departed'),
    transit: cell(row, 'transitPax', 'transit'),
    beltNo: cell(row, 'ArrBelt', 'beltNo'),
    SystemBagCount: cell(row, 'System Bag Count', 'SystemBagCount', 'systemBagCount'),
    dpr: cell(row, 'dpr'),
    wcc: cell(row, 'wcc'),
    wcs: cell(row, 'wcs'),
    wcr: cell(row, 'wcr'),
    Departure_wcc: cell(row, 'Departure_wcc'),
    Departure_wcs: cell(row, 'Departure_wcs'),
    Departure_wcr: cell(row, 'Departure_wcr'),
    CabincnfF: cell(row, 'CabincnfF', 'cabinBreakupF'),
    CabincnfC: cell(row, 'CabincnfC', 'cabinBreakupC'),
    CabincnfY: cell(row, 'CabincnfY', 'cabinBreakupY'),
    cntopen: cell(row, 'cntopen', 'counterOpen'),
    cntclose: cell(row, 'cntclose', 'counterClose'),
    brdopen: cell(row, 'brdopen', 'boardingOpen'),
    brdclose: cell(row, 'brdclose', 'boardingClose'),
  };

  const rampDetails1: Record<string, unknown> = {
    ...pickSchemaFields(row, RAMP_SCHEMA_KEYS),
    serialNo: SerialNo,
    airlinesOperator: airline,
    FlightNo: flightNo.toUpperCase(),
    flightNo: flightNo.toUpperCase(),
    Route: route,
    routing: route,
    TypeCraft: typeCraft,
    Typeofflight: typeOfFlight || typeOfHandling,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    ATADate: cell(row, 'ATADate'),
    ATATime: cell(row, 'ATATime'),
    BayPlanned: cell(row, 'BayPlanned', 'bayPlanned'),
    BayFinal: cell(row, 'BayFinal', 'bayFinal'),
    CleaningFr: cell(row, 'CleaningFr', 'cleaningStartedDate'),
    CleaningTo: cell(row, 'CleaningTo', 'cleaningClosedDate'),
    airlinecount: cell(row, 'airlinecount', 'arrivalBag'),
    bagreco: cell(row, 'bagreco'),
    arrivalBaggageCount: cell(row, 'arrivalBaggageCount', 'arrbag', 'departureBag'),
    Frontopen:
      cell(row, 'Frontopen', 'holdOpenFrontDate') ||
      cell(row, 'Departure_Front_Open'),
    Rearopen:
      cell(row, 'Rearopen', 'holdOpenRearDate') ||
      cell(row, 'Departure_Rear_Open'),
    Bulkopen:
      cell(row, 'Bulkopen', 'holdOpenBulkDate') ||
      cell(row, 'Departure_Bulk_Open'),
    MDopen:
      cell(row, 'MDopen', 'holdOpenMainDeckDate') ||
      cell(row, 'Departure_Main_Open'),
    Frontclose:
      cell(row, 'Frontclose', 'holdCloseFrontDate') ||
      cell(row, 'Arrival_Front_Close'),
    Rearclose:
      cell(row, 'Rearclose', 'holdCloseRearDate') ||
      cell(row, 'Arrival_Rear_Close'),
    Bulkclose:
      cell(row, 'Bulkclose', 'holdCloseBulkDate') ||
      cell(row, 'Arrival_Bulk_Close'),
    MDclose:
      cell(row, 'MDclose', 'holdCloseMainDeckDate') ||
      cell(row, 'Arrival_Main_Close'),
    uldarr: cell(row, 'uldarr'),
    uldplan: cell(row, 'uldplan'),
    uldatcdep: cell(row, 'uldatcdep'),
    cgoarr: cell(row, 'cgoarr'),
    cgoplan: cell(row, 'cgoplan'),
    cgoactdep: cell(row, 'cgoactdep'),
    mailarr: cell(row, 'mailarr'),
    mailplan: cell(row, 'mailplan'),
    mailactdep: cell(row, 'mailactdep'),
    cgopcsin: cell(row, 'cgopcsin'),
    cgopcout: cell(row, 'cgopcout'),
    Courierin: cell(row, 'Courierin'),
    Courierout: cell(row, 'Courierout'),
    hold: cell(row, 'hold'),
    holdstatus: cell(row, 'holdstatus'),
    hold_close: cell(row, 'hold_close'),
    fb: cell(row, 'fb'),
    fbstatus: cell(row, 'fbstatus'),
    lb: cell(row, 'lb'),
    lbstatus: cell(row, 'lbstatus'),
  };

  // Prefer real date/time open-close over placeholder "1/2/00" style tokens when both exist.
  for (const [k, placeholderKeys] of [
    ['Frontopen', ['Departure_Front_Open']],
    ['Rearopen', ['Departure_Rear_Open']],
    ['Bulkopen', ['Departure_Bulk_Open']],
    ['MDopen', ['Departure_Main_Open']],
    ['Frontclose', ['Arrival_Front_Close']],
    ['Rearclose', ['Arrival_Rear_Close']],
    ['Bulkclose', ['Arrival_Bulk_Close']],
    ['MDclose', ['Arrival_Main_Close']],
  ] as const) {
    const primary = cell(row, k);
    if (primary) rampDetails1[k] = primary;
    else {
      for (const pk of placeholderKeys) putIfEmpty(rampDetails1, k, cell(row, pk));
    }
  }

  const loadControlDetails: Record<string, unknown> = {
    ...pickSchemaFields(row, LOAD_CONTROL_SCHEMA_KEYS),
    serialNo: SerialNo,
    airlinesOperator: airline,
    FlightNo: flightNo.toUpperCase(),
    flightNo: flightNo.toUpperCase(),
    routing: route,
    TypeCraft: typeCraft,
    Typeofflight: typeOfFlight || typeOfHandling,
    STADate: staDate,
    STATime: staTime,
    STDDate: stdDate,
    STDTime: stdTime,
    ADCNO: cell(row, 'ADCNO', 'adc'),
    FICNO: cell(row, 'FICNO', 'fic'),
  };

  const ghRemarks =
    cell(row, 'handlingrem', 'ghRemarks', 'CALRem', 'Negative_Remarks') ||
    cell(row, 'PaxGHAirlineRep_Name');
  const remarks: Record<string, unknown> = {
    ...pickSchemaFields(row, REMARKS_SCHEMA_KEYS),
    serialNo: SerialNo,
    Airline: airline,
    FlightNo: flightNo.toUpperCase(),
    flightNo: flightNo.toUpperCase(),
    ghRemarks,
    PaxGHAirlineRep_Name: ghRemarks,
    AirRepRem: cell(row, 'AirRepRem', 'airlineRemarks'),
    airrep: cell(row, 'airrep', 'airlineRep'),
    ghRep: cell(row, 'calrep', 'GH_Sign_By', 'ghRep'),
    PAX_Airline_SignByDate: cell(row, 'GH_Sign_By', 'calrep', 'ghRep'),
  };

  return {
    mainDetails,
    terminalDetails,
    rampDetails1,
    loadControlDetails,
    remarks,
    exportedNAV,
  };
}

@Injectable()
export class MaaNsFhrExcelSeedService {
  private readonly logger = new Logger(MaaNsFhrExcelSeedService.name);

  constructor(private readonly nsFhr: NsFhrCollectionService) {}

  async importFromFilePath(
    filePath: string,
    opts: MaaNsFhrSeedOptions = {},
  ): Promise<MaaNsFhrSeedSummary> {
    const dryRun = Boolean(opts.dryRun);
    const only = opts.onlySerials?.length
      ? new Set(opts.onlySerials)
      : null;

    const wb = XLSX.readFile(filePath, { cellDates: false, raw: true });
    const sheetName =
      opts.sheetName?.trim() ||
      wb.SheetNames.find((n) => /^sheet1$/i.test(n)) ||
      wb.SheetNames[0];
    if (!sheetName || !wb.Sheets[sheetName]) {
      throw new Error(`Worksheet not found in ${filePath}`);
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
      { defval: '', raw: false },
    );

    const summary: MaaNsFhrSeedSummary = {
      dryRun,
      stationCode: LEGACY_STATION_CODE,
      workbook: filePath,
      totalRowsRead: rows.length,
      flightsProcessed: 0,
      upserted: 0,
      skippedRows: 0,
      rowErrors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const rowIndex = i + 2;
      try {
        const slRaw = cell(row, 'SerialNo', 'slNo', 'SlNo', 'SNO', 'S.No');
        const SerialNo = Number(String(slRaw).replace(/[^\d]/g, ''));
        if (!Number.isFinite(SerialNo) || SerialNo <= 0) {
          summary.skippedRows += 1;
          continue;
        }
        if (only && !only.has(SerialNo)) {
          summary.skippedRows += 1;
          continue;
        }

        const staDate = cell(row, 'STADate', 'staDate');
        if (!only && !rowInStaWindow(staDate, opts.fromYmd, opts.toYmd)) {
          summary.skippedRows += 1;
          continue;
        }

        const slices = buildNsFhrSlices(row, SerialNo);
        summary.flightsProcessed += 1;
        if (dryRun) continue;

        await this.nsFhr.upsertMerge(
          SerialNo,
          {
            mainDetails: slices.mainDetails as never,
            terminalDetails: slices.terminalDetails as never,
            rampDetails1: slices.rampDetails1 as never,
            loadControlDetails: slices.loadControlDetails as never,
            remarks: slices.remarks as never,
          },
          'maa_ns_fhr_excel_seed',
          MAA_SCOPE,
          { exportedNAV: slices.exportedNAV },
        );
        summary.upserted += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary.rowErrors.push({
          rowIndex,
          slNo: cell(row, 'SerialNo'),
          message,
        });
        this.logger.warn(`[seed ns_fhr] row ${rowIndex}: ${message}`);
      }
    }

    return summary;
  }
}

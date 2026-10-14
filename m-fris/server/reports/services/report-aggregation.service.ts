import { Injectable } from '@nestjs/common';
import { MainDetailsService } from '../../main-details/services/main-details.service';
import { TerminalDetailsService } from '../../terminal-details/services/terminal-details.service';
import { LoadControlDetailsService } from '../../load-control-details/services/load-control-details.service';
import { RampDetails1Service } from '../../ramp-details-1/services/ramp-details-1.service';
import { RemarksService } from '../../remarks/services/remarks.service';
import { AdvanceAircraftService } from '../../advance-aircraft/services/advance-aircraft.service';
import { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';
import { RawFlightDataService } from '../../raw-flight-data/services/raw-flight-data.service';
import { normalizeFhrFlightReportByLogicalSchema } from '../../fhr-collection/schema/fhr-flight-report-logical-type.schema';
import { resolveFlightReportCleaningDuration } from '../utils/cleaning-duration.util';
import { resolveFhrTotalDelay } from '../utils/total-delay.util';
import { flightNoFromArrivalDeparture, dedupeRepeatedFlightNoSegments } from '../utils/flight-no-display.util';
import { formatReportSerialNoDisplay } from '../utils/report-station-code.util';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  type StationScopeContext,
} from '../../common/station/station-scope';

@Injectable()
export class ReportAggregationService {
  constructor(
    private readonly mainDetailsService: MainDetailsService,
    private readonly terminalDetailsService: TerminalDetailsService,
    private readonly loadControlDetailsService: LoadControlDetailsService,
    private readonly rampDetails1Service: RampDetails1Service,
    private readonly remarksService: RemarksService,
    private readonly advanceAircraftService: AdvanceAircraftService,
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly rawFlightDataService: RawFlightDataService,
  ) {}

  /** Lean FHR sub-document → plain object for report mapping. */
  private static embedOrEmpty(v: unknown): Record<string, any> {
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, any>;
    }
    return {};
  }

  /** First non-empty string/number/boolean from embeds (Mongo uses mixed Pascal/camel keys). */
  private static firstReportScalar(...vals: unknown[]): string {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
      if (typeof v === 'boolean') return v ? 'Y' : 'N';
      const s = String(v).trim();
      if (s !== '') return s;
    }
    return '';
  }

  /**
   * Merge form-collection slice onto FHR/ns_fhr embed without wiping seed/filled
   * values with empty stub fields (connectivity: forms ↔ FHR report).
   */
  private static mergeEmbedPreferNonEmpty(
    base: unknown,
    overlay: unknown,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {
      ...ReportAggregationService.embedOrEmpty(base),
    };
    const src = ReportAggregationService.embedOrEmpty(overlay);
    for (const [key, value] of Object.entries(src)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      out[key] = value;
    }
    return out;
  }

  private static joinSpacedParts(...parts: unknown[]): string {
    return parts
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Hold open/close: date may live in Frontopen/etc. and time in holdOpen*Time,
   * or Excel/form may have stored a combined "date time" in the date field alone.
   * Never invents dates — only joins what was actually saved.
   */
  private static joinHoldDateTime(
    dateOrCombined: unknown,
    time: unknown,
  ): string {
    let datePart = String(dateOrCombined ?? '').trim();
    let timePart = String(time ?? '').trim();

    // Split combined "dd/mm/yyyy HH:mm" (or dash/ISO) stored in the date field.
    if (datePart && /\d{1,2}:\d{2}/.test(datePart)) {
      const m = datePart.match(
        /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})(?:[T\s]+(.+))?$/,
      );
      if (m) {
        datePart = (m[1] ?? '').trim();
        if (!timePart && m[2]) timePart = m[2].trim();
      }
    }

    if (!datePart && !timePart) return '';
    if (!datePart) return timePart;
    if (!timePart) return datePart;
    return `${datePart} ${timePart}`;
  }

  /** Sub-form GETs throw NotFoundException when nothing is saved yet; reports must still return 200. */
  private async tryFind<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  /**
   * MAIN FLIGHT REPORT
   */
  async getMainReportData(serialNo: number) {
    const [mainList, terminal, loadControl, ramp, remarks, schedule] = await Promise.all([
      this.tryFind(() =>
        this.mainDetailsService.findBySerial(
          serialNo,
          CROSS_STATION_SYSTEM_SCOPE,
        ),
      ),
      this.tryFind(() =>
        this.terminalDetailsService.findBySerial(
          serialNo,
          CROSS_STATION_SYSTEM_SCOPE,
        ),
      ),
      this.tryFind(() =>
        this.loadControlDetailsService.findBySerial(
          serialNo,
          CROSS_STATION_SYSTEM_SCOPE,
        ),
      ),
      this.tryFind(() =>
        this.rampDetails1Service.findBySerial(
          serialNo,
          CROSS_STATION_SYSTEM_SCOPE,
        ),
      ),
      this.tryFind(() =>
        this.remarksService.findBySerial(serialNo, CROSS_STATION_SYSTEM_SCOPE),
      ),
      this.rawFlightDataService.findScheduleBySerial(String(serialNo)),
    ]);

    const main = mainList;

    const mainObj: any = main?.toObject?.() ?? main ?? {};
    const termObj: any = terminal?.toObject?.() ?? terminal ?? {};
    const loadObj: any = loadControl?.toObject?.() ?? loadControl ?? {};
    const rampObj: any = ramp?.toObject?.() ?? ramp ?? {};
    const remarksObj: any = remarks?.toObject?.() ?? remarks ?? {};

    const s = (schedule ?? {}) as Record<string, unknown>;
    const reportData = {
      serialNo,
      mainDetails:
        Object.keys(mainObj).length > 0
          ? mainObj
          : {
              SerialNo: serialNo,
              Airline: String(s.airline ?? ''),
              FlightNo: String(s.flightNo ?? ''),
              TypeCraft: String(s.aircraft ?? ''),
              Route: String(s.route ?? ''),
              TypeofHandling: String(s.typeOfHandling ?? ''),
              Cate_of_Flight: String(s.categoryOfFlight ?? ''),
              STADate: String(s.staDate ?? ''),
              STDDate: String(s.stdDate ?? ''),
              STATime: String(s.staTime ?? ''),
              STDTime: String(s.stdTime ?? ''),
            },
      terminalDetails:
        Object.keys(termObj).length > 0
          ? termObj
          : {
              serialNo,
              airlinesOperator: String(s.airline ?? ''),
              FlightNo: String(s.flightNo ?? ''),
              TypeCraft: String(s.aircraft ?? ''),
              routing: String(s.route ?? ''),
              STADate: String(s.staDate ?? ''),
              STDDate: String(s.stdDate ?? ''),
              STATime: String(s.staTime ?? ''),
              STDTime: String(s.stdTime ?? ''),
            },
      loadControlDetails: loadObj,
      rampDetails: rampObj,
      remarks: remarksObj,
      generatedAt: new Date().toISOString(),
    };
    return reportData;
  }

  /**
   * Pure field-mapping kernel shared by `getFlightReportData` (single flight, full DB
   * reads) and `getFlightReportDataBatch` (bulk, pre-fetched).  No DB calls inside.
   *
   * `sched` is the raw schedule sub-document from `findEditableFlightBySerial` (used as
   * primary fallback for date/time fields).  Pass `{}` in bulk mode — the normalized
   * values from `schedule` cover the same fields via `s.*`.
   */
  private mapFlightReportFromPrefetched(
    serialNo: number,
    fhr: Record<string, unknown> | null,
    schedule: Record<string, unknown> | null,
    sched: Record<string, unknown>,
    mtow: string,
    station: StationScopeContext,
  ) {
    const s = (schedule ?? {}) as Record<string, unknown>;
    const m: any = ReportAggregationService.embedOrEmpty(
      (fhr as any)?.mainDetails,
    );
    const t: any = ReportAggregationService.embedOrEmpty(
      (fhr as any)?.terminalDetails,
    );
    const l: any = ReportAggregationService.embedOrEmpty(
      (fhr as any)?.loadControlDetails,
    );
    const r: any = ReportAggregationService.embedOrEmpty(
      (fhr as any)?.rampDetails1,
    );
    const rem: any = ReportAggregationService.embedOrEmpty(
      (fhr as any)?.remarks,
    );
    const eq: any = ReportAggregationService.embedOrEmpty(
      (fhr as any)?.equipmentManpower,
    );

    const flightNoDisplay = dedupeRepeatedFlightNoSegments(
      flightNoFromArrivalDeparture(m.ArrivalFltNo, m.DepartureFltNo) ||
        String(t.FlightNo ?? s.flightNo ?? m.FlightNo ?? m.flightCode ?? '').trim(),
    );

    const delayReasons = (() => {
      const mapRow = (d: Record<string, unknown>) => ({
        delay: String(d.Delay ?? d.delay ?? '').trim(),
        reasonOfDelay: String(
          d.ReasonofDelay ?? d.reasonOfDelay ?? d.ReasonOfDelay ?? '',
        ).trim(),
      });
      const raw = [
        ...(Array.isArray(m.arrivalDelays) ? m.arrivalDelays : []).map(
          (d: Record<string, unknown>) => mapRow(d || {}),
        ),
        ...(Array.isArray(m.departureDelays) ? m.departureDelays : []).map(
          (d: Record<string, unknown>) => mapRow(d || {}),
        ),
      ];
      const seen = new Set<string>();
      const out: { delay: string; reasonOfDelay: string }[] = [];
      for (const row of raw) {
        const delay = String(row.delay ?? '').trim();
        const reasonOfDelay = String(row.reasonOfDelay ?? '').trim();
        if (!reasonOfDelay) continue;
        const key = `${delay.toLowerCase()}|${reasonOfDelay.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ delay, reasonOfDelay });
      }
      return out;
    })();

    const cleaningFromTime = ReportAggregationService.firstReportScalar(
      ReportAggregationService.joinSpacedParts(r.CleaningFr, r.cleaningStartedTime),
      r.CleaningFr,
      r.cleaningStartedDate,
      r.cleaningStartedTime,
    );
    const cleaningToTime = ReportAggregationService.firstReportScalar(
      ReportAggregationService.joinSpacedParts(r.CleaningTo, r.cleaningClosedTime),
      r.CleaningTo,
      r.cleaningClosedDate,
      r.cleaningClosedTime,
    );
    const cleaningDuration = resolveFlightReportCleaningDuration(
      cleaningFromTime,
      cleaningToTime,
      r.cleaningStartedTime,
      r.cleaningClosedTime,
    );

    const ldpVal = ReportAggregationService.firstReportScalar(r.HoldCnfLDP, r.ldp);
    const mdpVal = ReportAggregationService.firstReportScalar(r.HoldCnfMDP, r.mdp);

    const arrivalDelayVal = ReportAggregationService.firstReportScalar(
      m.arrivalDelay,
      m.ActualDelay,
    );
    const departureDelayVal = ReportAggregationService.firstReportScalar(m.departureDelay);
    const totalDelayVal = resolveFhrTotalDelay({
      arrivalDelay: arrivalDelayVal,
      actualDelay: ReportAggregationService.firstReportScalar(m.ActualDelay, m.arrivalDelay),
      departureDelay: departureDelayVal,
      arrivalDelays: m.arrivalDelays,
      departureDelays: m.departureDelays,
    });

    const reportData = {
      serialNo,
      turnaroundStatus:
        ReportAggregationService.firstReportScalar(m.Cate_of_Flight, s.categoryOfFlight) ||
        'Scheduled',
      typeOfHandling: ReportAggregationService.firstReportScalar(
        m.TypeofHandling,
        s.typeOfHandling,
      ),
      mtow: ReportAggregationService.firstReportScalar(mtow, m.MTOW, m.mtow),
      baseFlight: m.stationBaseNightHalt ? 'Y' : 'N',
      terminalCode: ReportAggregationService.firstReportScalar(
        m.Terminal,
        m.terminalCode,
      ),
      serialNoDisplay: formatReportSerialNoDisplay(serialNo, station.stationCode),
      airlineName: ReportAggregationService.firstReportScalar(
        m.Airline,
        t.airlinesOperator,
        rem.Airline,
        s.airline,
      ),
      companyName: ReportAggregationService.firstReportScalar(
        m.CompanyName,
        m.companyName,
      ),
      // Prefer ops / TypeofHandling (Turnaround|Ferry|…) over Typeofflight
      // ("Non-Scheduled" on NS rows) so PDF Ops matches Open forms.
      ops: (() => {
        const candidates = [
          m.ops,
          m.TypeofHandling,
          t.ops,
          t.TypeofHandling,
          r.ops,
          r.TypeofHandling,
          m.Typeofflight,
          t.Typeofflight,
          r.Typeofflight,
          l.Typeofflight,
        ];
        for (const c of candidates) {
          const s = String(c ?? '').trim();
          if (!s) continue;
          if (/non[-\s]?scheduled/i.test(s)) continue;
          return s;
        }
        return ReportAggregationService.firstReportScalar(
          m.Typeofflight,
          t.Typeofflight,
          r.Typeofflight,
          l.Typeofflight,
        );
      })(),
      flightNo: flightNoDisplay,
      aircraftType: ReportAggregationService.firstReportScalar(
        m.TypeCraft,
        m.aircraftType,
        t.TypeCraft,
        t.acType,
        r.TypeCraft,
        r.acType,
        s.aircraft,
      ),
      aircraftRegnNo: ReportAggregationService.firstReportScalar(m.Regn, m.regnNo),
      staDate: ReportAggregationService.firstReportScalar(
        t.STADate, t.staDate, r.STADate, r.staDate, m.STADate, m.staDate,
        sched.staDate, sched['STA Date'], sched.STADate, sched.date,
        s.staDate,
      ),
      staTime: ReportAggregationService.firstReportScalar(
        t.STATime, t.sta, r.STATime, r.sta, m.STATime, m.staTime,
        sched.staTime, sched['STA Time'], sched.STATime,
        s.staTime,
      ),
      ataDate: ReportAggregationService.firstReportScalar(m.ATADate, m.ataDate, r.ATADate, r.ataDate),
      ataTime: ReportAggregationService.firstReportScalar(m.ATATime, m.ataTime, r.ATATime, r.ata),
      stdDate: ReportAggregationService.firstReportScalar(
        t.STDDate, t.stdDate, r.STDDate, r.stdDate, m.STDDate, m.stdDate,
        sched.stdDate, sched['STD Date'], sched.STDDate, sched.date2,
        s.stdDate,
      ),
      stdTime: ReportAggregationService.firstReportScalar(
        t.STDTime, t.std, r.STDTime, r.std, m.STDTime, m.stdTime,
        sched.stdTime, sched['STD Time'], sched.STDTime,
        s.stdTime,
      ),
      atdDate: ReportAggregationService.firstReportScalar(m.ATDDate, m.atdDate),
      atdTime: ReportAggregationService.firstReportScalar(m.ATDTime, m.atdTime),
      etdTime: ReportAggregationService.firstReportScalar(m.ETDtime, m.etdTime, r.etd, r.etdDate),
      bayNo: ReportAggregationService.firstReportScalar(r.BayFinal, r.bayFinal, r.BayPlanned, r.bayPlanned),
      gateNo: ReportAggregationService.firstReportScalar(
        t.GateFinal,
        t.gateFinal,
        t.GatePlanned,
        t.gatePlanned,
      ),
      routing: ReportAggregationService.firstReportScalar(
        m.Route, m.route, t.routing, r.Route, r.routing, l.routing, s.route,
      ),
      // Arrival total is stored as ActualDelay (legacy sheet name); never pick first-only.
      arrivalDelay: arrivalDelayVal,
      ActualDelay: arrivalDelayVal,
      departureDelay: departureDelayVal,
      arrivalDelays: Array.isArray(m.arrivalDelays) ? m.arrivalDelays : [],
      departureDelays: Array.isArray(m.departureDelays) ? m.departureDelays : [],
      totalDelay: totalDelayVal,
      status: ReportAggregationService.firstReportScalar(m.departureStatus),
      igmNo: ReportAggregationService.firstReportScalar(t.IGMNo, t.igm, m.IGMNo),
      egmNo: ReportAggregationService.firstReportScalar(t.EGMNo, t.egm, m.EGMNo),
      adcNo: ReportAggregationService.firstReportScalar(l.ADCNO, l.adc, m.ADCNO),
      ficNo: ReportAggregationService.firstReportScalar(l.FICNO, l.fic, m.FICNO),
      iposDate: ReportAggregationService.firstReportScalar(
        m.IPosDate,
        m.iposDate,
        m.IPOSDate,
      ),
      // Time may live only in IPosDate as combined "dd/mm/yyyy HH:mm" (Excel/import).
      // normalizeTime extracts the clock; date field still normalizes to date-only.
      iposTime: ReportAggregationService.firstReportScalar(
        m.IPosTime,
        m.iposTime,
        m.IPOSTime,
        m.IPosDate,
        m.iposDate,
        m.IPOSDate,
      ),
      delayReasons,
      cntOpenedTime: ReportAggregationService.firstReportScalar(t.cntopen, t.counterOpen),
      cntClosedTime: ReportAggregationService.firstReportScalar(t.cntclose, t.counterClose),
      boardingOpenedTime: ReportAggregationService.firstReportScalar(t.brdopen, t.boardingOpen),
      boardingClosedTime: ReportAggregationService.firstReportScalar(t.brdclose, t.boardingClose),
      arrivalPax: ReportAggregationService.firstReportScalar(
        t.arrivalpax,
        t.passengerArrived,
        m.arrivalpax,
      ),
      departurePax: ReportAggregationService.firstReportScalar(
        t.deppax,
        t.departed,
        m.deppax,
      ),
      bookingNo: ReportAggregationService.firstReportScalar(
        m.bookingNo,
        m.BookingNo,
        t.bookingNo,
      ),
      challanNo: ReportAggregationService.firstReportScalar(
        m.challanNo,
        m.ChallanNo,
        t.challanNo,
      ),
      // Ramp Bay & Baggage: Arrival Bag → airlinecount;
      // Departure bags → arrivalBaggageCount (form) / bagreco (legacy) / terminal.departureBag
      arrivalBag: ReportAggregationService.firstReportScalar(
        r.airlinecount, r.arrivalBag,
      ),
      departureBag: ReportAggregationService.firstReportScalar(
        r.arrivalBaggageCount,
        r.departureBaggageCount,
        r.bagreco,
        t.departureBag,
      ),
      cleaningFromTime,
      cleaningToTime,
      cleaningDuration,
      cleaning_duration: cleaningDuration,
      uldCargoArrived: ReportAggregationService.firstReportScalar(r.uldarr, r.arrivalUldCount),
      cargoArrived: ReportAggregationService.firstReportScalar(r.cgoarr, r.arrivalCargoWeight),
      mailArrived: ReportAggregationService.firstReportScalar(r.mailarr, r.arrivalMailWeight),
      uldCargoPlanned: ReportAggregationService.firstReportScalar(r.uldplan, r.depPlannedUldCount),
      cargoPlanned: ReportAggregationService.firstReportScalar(r.cgoplan, r.depPlannedCargoWeight),
      mailPlanned: ReportAggregationService.firstReportScalar(r.mailplan, r.depPlannedMailWeight),
      uldCargoDeparted: ReportAggregationService.firstReportScalar(r.uldatcdep, r.depActualUldCount),
      cargoDeparted: ReportAggregationService.firstReportScalar(r.cgoactdep, r.depActualCargoWeight),
      mailDeparted: ReportAggregationService.firstReportScalar(r.mailactdep, r.depActualMailWeight),
      cargoPcsIn: ReportAggregationService.firstReportScalar(r.cgopcsin, r.cgoPcsIn),
      cargoPcsOut: ReportAggregationService.firstReportScalar(r.cgopcout, r.cgoPcsOut),
      courierIn: ReportAggregationService.firstReportScalar(r.Courierin, r.courierPcsIn),
      courierOut: ReportAggregationService.firstReportScalar(r.Courierout, r.courierPcsOut),
      // Form saves dates on Frontopen/Rearopen/… and times on holdOpen*Time.
      // Do NOT join empty holdOpen*Date with time first — that returns time-only
      // and firstReportScalar never reaches the real Frontopen date.
      cargoCompartmentFrontOpen: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.Frontopen,
          r.holdOpenFrontDate,
        ),
        r.holdOpenFrontTime,
      ),
      cargoCompartmentRearOpen: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.Rearopen,
          r.holdOpenRearDate,
        ),
        r.holdOpenRearTime,
      ),
      cargoCompartmentBulkOpen: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.Bulkopen,
          r.holdOpenBulkDate,
        ),
        r.holdOpenBulkTime,
      ),
      cargoCompartmentMainOpen: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.MDopen,
          r.holdOpenMainDeckDate,
        ),
        r.holdOpenMainDeckTime,
      ),
      cargoCompartmentFrontClose: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.Frontclose,
          r.holdCloseFrontDate,
        ),
        r.holdCloseFrontTime,
      ),
      cargoCompartmentRearClose: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.Rearclose,
          r.holdCloseRearDate,
        ),
        r.holdCloseRearTime,
      ),
      cargoCompartmentBulkClose: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.Bulkclose,
          r.holdCloseBulkDate,
        ),
        r.holdCloseBulkTime,
      ),
      cargoCompartmentMainClose: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.MDclose,
          r.holdCloseMainDeckDate,
        ),
        r.holdCloseMainDeckTime,
      ),
      lastActivityTimeOnHold: ReportAggregationService.joinHoldDateTime(
        ReportAggregationService.firstReportScalar(
          r.LasteActivityOnHold,
          r.lastActivityHoldDate,
        ),
        r.lastActivityHoldTime,
      ),
      transitCargo: ReportAggregationService.firstReportScalar(
        r.transitcgo, r.transitCargoWeight, r.transitCargoUld, r.transitCargoMail,
      ),
      cabinConfigF: ReportAggregationService.firstReportScalar(t.CabincnfF, t.cabinBreakupF),
      cabinConfigC: ReportAggregationService.firstReportScalar(t.CabincnfC, t.cabinBreakupC),
      cabinConfigY: ReportAggregationService.firstReportScalar(t.CabincnfY, t.cabinBreakupY),
      ldc: ReportAggregationService.firstReportScalar(r.HoldCnfLDC, r.ldc),
      ldpmdp:
        [ldpVal, mdpVal].filter((v) => v !== '').join(' / ') ||
        ReportAggregationService.firstReportScalar(r.ldpmdp),
      ldp: ldpVal,
      mdp: mdpVal,
      firstArrHall: ReportAggregationService.firstReportScalar(
        ReportAggregationService.joinSpacedParts(
          r.Fbarr ?? r.firstBagArrivalHallDate,
          r.firstBagArrivalHallTime,
        ),
      ),
      lastArrHall: ReportAggregationService.firstReportScalar(
        ReportAggregationService.joinSpacedParts(
          r.Lbarr ?? r.lastBagArrivalHallDate,
          r.lastBagArrivalHallTime,
        ),
      ),
      firstBMA: ReportAggregationService.firstReportScalar(
        ReportAggregationService.joinSpacedParts(r.firstBagInBmaDate, r.firstBagInBmaTime),
      ),
      lastBMA: ReportAggregationService.firstReportScalar(
        ReportAggregationService.joinSpacedParts(r.lastBagInBmaDate, r.lastBagInBmaTime),
      ),
      holdConfig: ReportAggregationService.firstReportScalar(r.holdConfig),
      wheelChairArrivalC:
        ReportAggregationService.firstReportScalar(t.wcc, t.arrivalWheelChairC) || '0',
      wheelChairArrivalS:
        ReportAggregationService.firstReportScalar(t.wcs, t.arrivalWheelChairS) || '0',
      wheelChairArrivalR:
        ReportAggregationService.firstReportScalar(t.wcr, t.arrivalWheelChairR) || '0',
      wheelChairDepartureC:
        ReportAggregationService.firstReportScalar(t.Departure_wcc, t.departureWheelChairC) || '0',
      wheelChairDepartureS:
        ReportAggregationService.firstReportScalar(t.Departure_wcs, t.departureWheelChairS) || '0',
      wheelChairDepartureR:
        ReportAggregationService.firstReportScalar(t.Departure_wcr, t.departureWheelChairR) || '0',
      ghRemarks: ReportAggregationService.firstReportScalar(rem.ghRemarks, rem.PaxGHAirlineRep_Name),
      airlineRemarks: ReportAggregationService.firstReportScalar(
        rem.AirRepRem, rem.airlineRemarks, rem.airrep, rem.Air_rep,
      ),
      ghRepresentativeName:
        rem.ghRep || rem.PAX_Airline_SignByDate || m.PAX_Airline_SignByDate || '',
      airlineRepresentativeName: rem.airrep || m.airrep || '',
      verifiedBy: String(eq.verifiedBy ?? '').trim(),
      printedOnDateTime: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    };
    return normalizeFhrFlightReportByLogicalSchema(reportData);
  }

  async getFlightReportData(
    serialNo: number,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ) {
    const [
      editableFlight,
      schedule,
      fhrPrimary,
      mtowResolved,
      mainFromSource,
      terminalFromSource,
      loadFromSource,
      rampFromSource,
      remarksFromSource,
    ] = await Promise.all([
      this.tryFind(() =>
        this.rawFlightDataService.findEditableFlightBySerial(
          String(serialNo),
          station,
        ),
      ),
      this.tryFind(() =>
        this.rawFlightDataService.findScheduleBySerial(String(serialNo)),
      ),
      this.tryFind(() =>
        this.fhrCollectionService.getLeanFhrBySerial(serialNo, station),
      ),
      this.tryFind(() =>
        this.advanceAircraftService.resolveMtowForFlightSerial(
          String(serialNo),
          station,
        ),
      ).then((v) => v ?? ''),
      this.tryFind(() =>
        this.mainDetailsService.findBySerial(serialNo, station),
      ),
      this.tryFind(() =>
        this.terminalDetailsService.findBySerial(serialNo, station),
      ),
      this.tryFind(() =>
        this.loadControlDetailsService.findBySerial(serialNo, station),
      ),
      this.tryFind(() =>
        this.rampDetails1Service.findBySerial(serialNo, station),
      ),
      this.tryFind(() => this.remarksService.findBySerial(serialNo, station)),
    ]);
    const sched = (editableFlight?.schedule ?? {}) as Record<string, unknown>;

    let fhr = fhrPrimary;
    const scheduleMasterSerial = String(editableFlight?.serialNo ?? '').trim();
    if (!fhr && scheduleMasterSerial) {
      const masterNum = Number(scheduleMasterSerial);
      if (Number.isFinite(masterNum) && masterNum !== serialNo) {
        fhr = await this.tryFind(() =>
          this.fhrCollectionService.getLeanFhrBySerial(masterNum, station),
        );
      }
    }

    // Base = fhr_collection / ns_fhr_collection. Overlay form collections with
    // non-empty merge so empty stubs never wipe seeded / mirrored FHR embeds.
    const overlaySource = (slice: string, doc: unknown) => {
      if (doc == null || typeof doc !== 'object') return;
      const plain = FhrCollectionService.stripMongoMetaForFhrEmbed(
        doc as unknown as Record<string, unknown>,
      );
      const baseDoc =
        fhr ??
        ({ SerialNo: serialNo, flightSerialNumber: serialNo } as Record<
          string,
          unknown
        >);
      fhr = {
        ...baseDoc,
        [slice]: ReportAggregationService.mergeEmbedPreferNonEmpty(
          (baseDoc as Record<string, unknown>)[slice],
          plain,
        ),
      } as typeof fhr;
    };
    overlaySource('mainDetails', mainFromSource);
    overlaySource('terminalDetails', terminalFromSource);
    overlaySource('loadControlDetails', loadFromSource);
    overlaySource('rampDetails1', rampFromSource);
    overlaySource('remarks', remarksFromSource);

    const m = ReportAggregationService.embedOrEmpty(
      (fhr as { mainDetails?: unknown } | null)?.mainDetails,
    );
    const mtow = ReportAggregationService.firstReportScalar(
      mtowResolved,
      m.MTOW,
      m.mtow,
    );

    return this.mapFlightReportFromPrefetched(
      serialNo,
      fhr,
      schedule as Record<string, unknown> | null,
      sched,
      mtow,
      station,
    );
  }

  /**
   * Bulk flight-report lookup: 3 DB round-trips total for any batch size instead
   * of ~4 × N round-trips in the previous per-serial concurrent pool.
   *
   * Strategy:
   *   1. ONE `fhr_collection.$in` query for all serials (all embedded sub-docs at once).
   *   2. ONE `advance_schedule_setup.$in` + ONE `scheduled_airlines_creation.$in` for
   *      schedule fallback data.
   *   3. Map each serial synchronously from pre-fetched maps — no further DB calls.
   *   4. Serials whose FHR doc was not found fall back to the full per-serial
   *      `getFlightReportData` path (rare: only new/un-synced flights).
   */
  async getFlightReportDataBatch(
    serialNos: number[],
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<number, Awaited<ReturnType<ReportAggregationService['getFlightReportData']>>>> {
    const unique = Array.from(
      new Set(serialNos.filter((n) => Number.isFinite(n))),
    );
    const out: Record<
      number,
      Awaited<ReturnType<ReportAggregationService['getFlightReportData']>>
    > = {};
    if (unique.length === 0) return out;

    const [fhrMap, scheduleMap] = await Promise.all([
      this.fhrCollectionService.getLeanFhrDocsBatch(unique, station),
      this.rawFlightDataService.findSchedulesBySerialsBulk(unique, station),
    ]);

    const fallbackSerials: number[] = [];

    for (const serialNo of unique) {
      const fhr = fhrMap.get(serialNo) ?? null;
      if (!fhr) {
        fallbackSerials.push(serialNo);
        continue;
      }
      const schedule = (scheduleMap.get(serialNo) ?? null) as Record<
        string,
        unknown
      > | null;
      try {
        out[serialNo] = this.mapFlightReportFromPrefetched(
          serialNo,
          fhr,
          schedule,
          {},
          '',
          station,
        );
      } catch {
        fallbackSerials.push(serialNo);
      }
    }

    if (fallbackSerials.length > 0) {
      const CONCURRENCY = 20;
      let cursor = 0;
      const worker = async () => {
        while (cursor < fallbackSerials.length) {
          const serialNo = fallbackSerials[cursor++];
          const r = await this.getFlightReportData(serialNo, station).catch(
            () => null,
          );
          if (r) out[serialNo] = r;
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, fallbackSerials.length) },
          () => worker(),
        ),
      );
    }

    return out;
  }

  /**
   * EQUIPMENT / MANPOWER REPORT — `fhr_collection` embeds only (aligned with scheduled airlines).
   */
  async getEquipmentSheetData(serialNo: number) {
    const fhr = await this.fhrCollectionService.getLeanFhrBySerial(serialNo);
    const schedule = await this.rawFlightDataService.findScheduleBySerial(
      String(serialNo),
    );
    const s = (schedule ?? {}) as Record<string, unknown>;
    const mainObj: any = ReportAggregationService.embedOrEmpty(
      fhr?.mainDetails,
    );
    const eqDoc: any = ReportAggregationService.embedOrEmpty(
      fhr?.equipmentManpower,
    );

    const entries = Array.isArray(eqDoc.entries)
      ? eqDoc.entries.map((e: any) => ({
          name: e.name,
          fromDate: e.fromDate,
          fromTime: e.fromTime,
          toDate: e.toDate,
          toTime: e.toTime,
          from: [e.fromDate, e.fromTime].filter(Boolean).join(' '),
          to: [e.toDate, e.toTime].filter(Boolean).join(' '),
          remarks: e.remarks,
        }))
      : [];

    return {
      serialNo,
      flightInfo: {
        flightNo: eqDoc.flightNo || mainObj.flightCode || s.flightNo,
        stdDate: eqDoc.stdDate || mainObj.stdDate || s.stdDate,
        stdTime: eqDoc.std || mainObj.etdTime,
        atdDate: eqDoc.atdDate || mainObj.atdDate,
        atdTime: eqDoc.atdTime || mainObj.atdTime,
        aircraftType: eqDoc.acType || mainObj.aircraftType || s.aircraft,
        staDate: eqDoc.staDate || mainObj.staDate || s.staDate,
        staTime: eqDoc.sta || mainObj.ataTime,
        ataDate: eqDoc.ataDate || mainObj.ataDate,
        ataTime: eqDoc.ataTime || mainObj.ataTime,
        airline: eqDoc.airlinesOperator || mainObj.airlineName || s.airline,
      },
      equipmentManpowerEntries: entries,
      listType: eqDoc.listType ?? 'Equipment',
      generatedAt: new Date().toISOString(),
    };
  }
}

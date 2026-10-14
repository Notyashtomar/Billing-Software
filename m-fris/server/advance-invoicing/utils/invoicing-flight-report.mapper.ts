import {
  mergeFhrMainEmbeds,
  resolveAircraftBodyLabel,
  resolveTurnaroundStatusLabel,
  resolveScheduledFlightCancelled,
} from 'src/billing/utils/scheduled-flight-display.util';

type ReportLike = Record<string, unknown>;

/**
 * Same rule as Scheduled Airlines: a stored CANC flight number keeps every character except spaces.
 * Otherwise keep the arrival/departure pair.
 */
function resolveBillingFlightNo(
  m: Record<string, unknown>,
  t: Record<string, unknown>,
  r: Record<string, unknown>,
  l: Record<string, unknown>,
  dailyData?: Record<string, unknown>,
): string {
  for (const raw of [
    m.FlightNo,
    m.flightNo,
    t.FlightNo,
    t.flightNo,
    r.FlightNo,
    l.FlightNo,
    dailyData?.flightNo,
    dailyData?.FlightNo,
  ]) {
    const compact = String(raw ?? '').replace(/\s+/g, '');
    if (/^CANC/i.test(compact)) return compact;
  }
  if (m.DepartureFltNo && m.ArrivalFltNo) {
    return `${m.ArrivalFltNo}/${m.DepartureFltNo}`;
  }
  return pick(m.DepartureFltNo, m.ArrivalFltNo, t.FlightNo, dailyData?.flightNo);
}

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function embed(doc: Record<string, unknown> | null | undefined, key: string) {
  const v = doc?.[key];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function hasObjectPayload(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length > 0;
}

function hasEquipmentManpowerPayload(eq: Record<string, unknown>): boolean {
  if (!hasObjectPayload(eq)) return false;
  const entries = Array.isArray(eq.entries) ? eq.entries : [];
  if (entries.length > 0) return true;
  return Boolean(
    pick(eq.fromTime, eq.toTime, eq.equipmentFromTime, eq.equipmentToTime, eq.verifiedBy),
  );
}

function isCancelledDailyRow(
  dailyData: Record<string, unknown> | undefined,
  flightNo: string,
): boolean {
  return resolveScheduledFlightCancelled(dailyData, flightNo);
}

function resolvePaxFreightLabel(
  aircraftType: string,
  categoryOfFlight: string,
): string {
  const cat = categoryOfFlight.toLowerCase();
  if (
    cat.includes('cargo') ||
    cat.includes('freight') ||
    cat.includes('freighter')
  ) {
    return 'Freighter';
  }
  const ac = aircraftType.trim();
  if (!ac) return '';
  if (/f/i.test(ac)) return 'Freighter';
  return 'Passenger';
}

export function mapFhrToInvoicingFlightReportRow(
  serialNo: number,
  fhr: Record<string, unknown> | null | undefined,
  dailyData?: Record<string, unknown>,
): Record<string, string | boolean> {
  const m = embed(fhr, 'mainDetails');
  const t = embed(fhr, 'terminalDetails');
  const r = embed(fhr, 'rampDetails1');
  const l = embed(fhr, 'loadControlDetails');
  const rem = embed(fhr, 'remarks');
  const eq = embed(fhr, 'equipmentManpower');

  const flightNo = resolveBillingFlightNo(m, t, r, l, dailyData);

  const resolvedSerial = pick(
    serialNo > 0 ? serialNo : '',
    fhr?.SerialNo,
    fhr?.flightSerialNumber,
    m.SerialNo,
    m.serialNo,
    t.serialNo,
    dailyData?.SlNo,
    dailyData?.slNo,
    dailyData?.['Serial No'],
    dailyData?.serialNo,
  );

  const merged = mergeFhrMainEmbeds(m, t, r, l);
  const aircraftType = pick(
    merged.TypeCraft,
    merged.typeCraft,
    merged.aircraftType,
    dailyData?.aircraft,
  );
  const categoryOfFlight = pick(merged.Cate_of_Flight, merged.flightCategory);
  const ops = pick(merged.ops, merged.opsType, merged.Typeofflight);
  const turnaroundStatus = resolveTurnaroundStatusLabel(merged, categoryOfFlight);
  const aircraftBody = resolveAircraftBodyLabel(merged, aircraftType, null);

  const rawAirlineCode = pick(merged.Arline_Code, merged.airlineCode, merged.AirlineCode);
  const airlineCodeFromFlight = String(rawAirlineCode)
    .trim()
    .toUpperCase()
    .match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/);
  const customerCode = airlineCodeFromFlight?.[1]
    ? airlineCodeFromFlight[1]
    : rawAirlineCode;

  const row: Record<string, string | boolean> = {
    selectData: false,
    type: 'Flight',
    flightNoEquipmentNo: flightNo,
    aircraftType,
    customerCode,
    customerName: pick(merged.Airline, t.airlinesOperator, rem.Airline, dailyData?.airline),
    categoryOfFlight,
    typeOfHandling: pick(merged.TypeofHandling, merged.typeOfHandling),
    typeOfFlight: pick(m.Typeofflight, t.Typeofflight, r.Typeofflight, l.Typeofflight),
    ops,
    turnaroundStatus,
    paxFreight: resolvePaxFreightLabel(aircraftType, categoryOfFlight),
    staDate: pick(t.STADate, t.staDate, r.STADate, r.staDate, dailyData?.staDate),
    staTime: pick(t.STATime, t.sta, r.STATime, r.sta, dailyData?.staTime),
    ataDate: pick(m.ATADate, m.ataDate, r.ATADate, r.ataDate),
    ataTime: pick(m.ATATime, m.ataTime, r.ATATime, r.ata),
    stdDate: pick(t.STDDate, t.stdDate, r.STDDate, r.stdDate, dailyData?.stdDate),
    stdTime: pick(t.STDTime, t.std, r.STDTime, r.std, dailyData?.stdTime),
    atdDate: pick(m.ATDDate, m.atdDate, dailyData?.atdDate),
    atdTime: pick(m.ATDTime, m.atdTime, dailyData?.atdTime),
    groundRoundTime: '',
    delayOnStd: pick(m.departureDelay, m.ActualDelay, m.arrivalDelay),
    flightQuantity: '1',
    serialNumber: resolvedSerial,
    arrivalUld: pick(r.uldarr, r.uldCargoArrived),
    arrivalCargo: pick(r.cgoarr, r.cargoArrived),
    arrivalMail: pick(r.mailarr, r.mailArrived),
    departurePlanUld: pick(r.uldplan, r.uldCargoPlanned),
    departurePlanCargo: pick(r.cgoplan, r.cargoPlanned),
    departurePlanMail: pick(r.mailplan, r.mailPlanned),
    departureActualUld: pick(r.ulddep, r.uldCargoDeparted),
    departureActualCargo: pick(r.cgodep, r.cargoDeparted),
    departureActualMail: pick(r.maildep, r.mailDeparted),
    transitUld: pick(r.transituld, r.transitUld),
    transitCargo: pick(r.transitcgo, r.transitCargo, r.transitCargoKg),
    transitMail: pick(r.transitmail, r.transitMail),
    bwfsRepRemarksI: pick(rem.GHRepRemarks, rem.ghRepRemarks, m.ghRep),
    airlineRepRemarksI: pick(rem.AirlineRepRemarks, rem.airlineRepRemarks, m.airrep),
    quantityEquipmentManpower: pick(eq.totalQuantity, eq.quantity),
    equipmentFromTime: pick(eq.fromTime, eq.equipmentFromTime),
    equipmentToTime: pick(eq.toTime, eq.equipmentToTime),
    equipmentUsesTime: pick(eq.usageTime, eq.equipmentUsesTime),
    delayOnSta: pick(m.arrivalDelay, m.ActualDelay),
    cargo: pick(m.Typeofflight, t.Typeofflight)?.toLowerCase().includes('cargo')
      ? 'Y'
      : '',
    aircraftBody,
    terminal: pick(m.Terminal, m.terminalCode, t.Terminal),
    returnToRamp: m.returnToRamp === true ? 'Y' : m.returnToRamp === false ? 'N' : '',
    weightLitre: '',
    unit: '',
    mtow: pick(m.mtow, m.MTOW),
    route: pick(m.Route, m.route, t.routing, r.Route, l.routing, dailyData?.route),
    regn: pick(m.Regn, m.regnNo, dailyData?.regnNo),
    entryNo: pick(l.ADCNO, l.adc, t.IGMNo),
    hasMainDetails: hasObjectPayload(m),
    hasTerminalDetails: hasObjectPayload(t),
    hasRampDetails: hasObjectPayload(r),
    hasLoadControlDetails: hasObjectPayload(l),
    hasEquipmentManpowerDetails: hasEquipmentManpowerPayload(eq),
    rampLocked: pick(m.rampLocked, m.RampLocked, dailyData?.rampLocked),
    paxLocked: pick(m.paxLocked, m.PaxLocked, dailyData?.paxLocked),
    gsdLocked: pick(m.gsdLocked, m.GsdLocked, dailyData?.gsdLocked),
    baseFlight: pick(m.baseFlight, m.BaseFlight),
    flightStatus: pick(dailyData?.flightStatus, m.flightStatus),
    isCancelled: isCancelledDailyRow(dailyData, flightNo),
  };

  return row;
}

export function reportDateYmd(
  raw: unknown,
): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const dash = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
  }
  return null;
}

export function isExportedNavValue(value: unknown): boolean {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return s === 'exported' || s === 'y' || s === 'yes';
}

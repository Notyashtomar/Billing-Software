/**
 * Sheet2-driven mapping: schema key -> which FRIS persistence modules receive the value.
 * "fhr" = no standalone operational collection for this workbook; see README.
 */

export type ImportTarget =
  | 'main'
  | 'terminal'
  | 'ramp'
  | 'loadControl'
  | 'remarks'
  | 'fhr';

export function resolveModulesFromFormRow(
  formNameRaw: string,
  schemaKey: string,
): ImportTarget[] {
  const key = String(schemaKey ?? '').trim();
  if (!key) return [];

  const f = String(formNameRaw ?? '')
    .trim()
    .toLowerCase();

  if (f.includes('fhr') || f.includes('flight handling report')) {
    return ['fhr'];
  }

  if (!f) {
    if (key === 'staDate' || key === 'stdDate') {
      return ['terminal', 'ramp', 'loadControl'];
    }
    if (key === 'iposDate' || key === 'iposTime') return ['main'];
    return [];
  }

  if (f.includes('remark')) return ['remarks'];
  if (f.includes('load control')) return ['loadControl'];
  if (f.includes('terminal')) return ['terminal'];
  if (f.includes('ramp')) return ['ramp'];

  if (f.includes('schedule')) {
    if (['sta', 'std', 'staDate', 'stdDate'].includes(key)) {
      return ['terminal', 'ramp', 'loadControl'];
    }
  }

  if (f.includes('advance')) {
    if (key === 'flightCategory') return ['main'];
    return [];
  }

  if (f.includes('aircraft registration')) return ['main'];
  if (f.includes('main')) return ['main'];

  return [];
}

export function buildKeyToModulesFromSheet2(
  rows: string[][],
): Map<string, Set<ImportTarget>> {
  const map = new Map<string, Set<ImportTarget>>();
  for (let i = 1; i < rows.length; i++) {
    const form = String(rows[i][0] ?? '');
    const schemaKey = String(rows[i][2] ?? '').trim();
    if (!schemaKey) continue;
    const mods = resolveModulesFromFormRow(form, schemaKey);
    if (!map.has(schemaKey)) map.set(schemaKey, new Set());
    for (const m of mods) map.get(schemaKey)!.add(m);
  }
  return map;
}

/** Align operational forms with schedule + routing columns present on Sheet1. */
export function augmentKeyToModulesForSheet1(
  headers: string[],
  keyToModules: Map<string, Set<ImportTarget>>,
): void {
  const ensure = (key: string, targets: ImportTarget[]) => {
    if (!headers.includes(key)) return;
    if (!keyToModules.has(key)) keyToModules.set(key, new Set());
    for (const t of targets) keyToModules.get(key)!.add(t);
  };

  ensure('ops', ['terminal', 'ramp', 'loadControl']);
  ensure('route', ['terminal', 'ramp', 'loadControl']);
  ensure('acType', ['terminal', 'ramp', 'loadControl']);
  ensure('sta', ['terminal', 'ramp', 'loadControl']);
  ensure('std', ['terminal', 'ramp', 'loadControl']);
  ensure('staDate', ['terminal', 'ramp', 'loadControl']);
  ensure('stdDate', ['terminal', 'ramp', 'loadControl']);
}

/**
 * Whitelist: legacy Sheet1 / row-1 column names and `correct version` row-2 field names
 * (main details import may supply either).
 */
export const MAIN_SCHEMA_KEYS = new Set<string>([
  'airlineName',
  'airline',
  'Airline',
  'flightCode',
  'FlightNo',
  'Arline_Code',
  'ifOperationSplit',
  'ArrivalFltNo',
  'DepartureFltNo',
  'ataDate',
  'ataTime',
  'ATADate',
  'ATATime',
  'atdDate',
  'atdTime',
  'ATDDate',
  'ATDTime',
  'iposDate',
  'iposTime',
  'IPosDate',
  'IPosTime',
  'etdDate',
  'etdTime',
  'ETDtime',
  'regnNo',
  'Regn',
  'terminalCode',
  'Terminal',
  'route',
  'Route',
  'ops',
  'Typeofflight',
  'TypeofHandling',
  'typeOfHandling',
  'flightCategory',
  'Cate_of_Flight',
  'stationBaseNightHalt',
  'aircraftType',
  'TypeCraft',
  'aircraftBody',
  'AircraftBody',
  'returnToRamp',
  'stdLessThanSta',
  'arrivalDelay',
  'ActualDelay',
  'departureStatus',
  'Delay',
  'departureDelay',
  'departureDelays',
  'arrivalDelays',
  'ghRep',
  'PAX_Airline_SignByDate',
  'airlineRep',
  'airrep',
  'flightCancelled',
  'fltcancelled',
  'freighter',
  'Cgo',
  'medicalPassenger',
  'Medical_Passenger',
  'MTOW',
  'mtow',
  'STADate',
  'STATime',
  'STDDate',
  'STDTime',
]);

export const TERMINAL_SCHEMA_KEYS = new Set<string>([
  'airlinesOperator',
  'flightNo',
  'FlightNo',
  'routing',
  'operations',
  'Typeofflight',
  'acType',
  'TypeCraft',
  'sta',
  'STATime',
  'staDate',
  'STADate',
  'std',
  'STDTime',
  'stdDate',
  'STDDate',
  'igm',
  'IGMNo',
  'egm',
  'EGMNo',
  'dpr',
  'ohd',
  'offLoadPax',
  'ahl',
  'gatePlanned',
  'GatePlanned',
  'gateFinal',
  'GateFinal',
  'counterOpen',
  'cntclose',
  'counterClose',
  'cntopen',
  'systemBagCount',
  'SystemBagCount',
  'boardingOpen',
  'brdopen',
  'boardingClose',
  'brdclose',
  'beltNo',
  'passengerArrived',
  'arrivalpax',
  'departed',
  'deppax',
  'transit',
  'transitPax',
  'beltNo',
  'ArrBelt',
  'cabinBreakupF',
  'CabincnfF',
  'cabinBreakupC',
  'CabincnfC',
  'cabinBreakupY',
  'CabincnfY',
  'arrivalWheelChairR',
  'wcr',
  'arrivalWheelChairS',
  'wcs',
  'arrivalWheelChairC',
  'wcc',
  'departureWheelChairR',
  'Departure_wcr',
  'departureWheelChairS',
  'Departure_wcs',
  'departureWheelChairC',
  'Departure_wcc',
]);

export const RAMP_SCHEMA_KEYS = new Set<string>([
  'airlinesOperator',
  'flightNo',
  'FlightNo',
  'routing',
  'Route',
  'operations',
  'Typeofflight',
  'etdDate',
  'acType',
  'TypeCraft',
  'staDate',
  'STADate',
  'std',
  'STDTime',
  'etd',
  'sta',
  'STATime',
  'ata',
  'ATATime',
  'stdDate',
  'STDDate',
  'ataDate',
  'ATADate',
  'bayPlanned',
  'BayPlanned',
  'bayFinal',
  'BayFinal',
  'arrivalBaggageCount',
  'firstBagArrivalHallDate',
  'Fbarr',
  'firstBagArrivalHallTime',
  'bmaCount',
  'lastBagArrivalHallDate',
  'Lbarr',
  'bagreco',
  'departureBag',
  'lastBagArrivalHallTime',
  'bbaBelt',
  'firstBagInBmaDate',
  'Fbmup',
  'firstBagInBmaTime',
  'arrivalBag',
  'airlinecount',
  'lastBagInBmaDate',
  'Lbmup',
  'lastBagInBmaTime',
  'xRay',
  'XRay',
  'cleaningStartedDate',
  'CleaningFr',
  'cleaningStartedTime',
  'oneSidedBelt',
  'One-Sided Belt',
  'customChecked',
  'Custom Checked',
  'cleaningClosedDate',
  'CleaningTo',
  'cleaningClosedTime',
  'etdDate',
  'ETDdate',
  'ETDtime',
  'etd',
  'ldc',
  'HoldCnfLDC',
  'ldp',
  'HoldCnfLDP',
  'mdp',
  'HoldCnfMDP',
  'holdConfig',
  'cgoPcsIn',
  'cgopcsin',
  'cgoPcsOut',
  'cgopcout',
  'courierPcsIn',
  'Courierout',
  'courierPcsOut',
  'Courierin',
  'ifNightHalt',
  'holdOpenFrontDate',
  'Frontopen',
  'holdOpenFrontTime',
  'holdOpenRearDate',
  'Rearopen',
  'holdOpenRearTime',
  'holdOpenBulkDate',
  'Bulkopen',
  'holdOpenBulkTime',
  'holdOpenMainDeckDate',
  'MDopen',
  'holdOpenMainDeckTime',
  'holdCloseFrontDate',
  'Frontclose',
  'holdCloseFrontTime',
  'holdCloseRearDate',
  'Rearclose',
  'holdCloseRearTime',
  'holdCloseBulkDate',
  'Bulkclose',
  'holdCloseBulkTime',
  'holdCloseMainDeckDate',
  'MDclose',
  'holdCloseMainDeckTime',
  'lastActivityHoldDate',
  'LasteActivityOnHold',
  'lastActivityHoldTime',
  'arrivalUldCount',
  'uldarr',
  'arrivalCargoWeight',
  'cgoarr',
  'arrivalMailWeight',
  'mailarr',
  'depPlannedUldCount',
  'uldplan',
  'depPlannedCargoWeight',
  'cgoactdep',
  'depPlannedMailWeight',
  'mailplan',
  'depActualUldCount',
  'uldatcdep',
  'depActualCargoWeight',
  'cgoplan',
  'depActualMailWeight',
  'mailactdep',
  'transitCargoUld',
  'transitcgo',
  'transitCargoWeight',
  'transitCargoMail',
]);

export const LOAD_CONTROL_SCHEMA_KEYS = new Set<string>([
  'airlinesOperator',
  'flightNo',
  'FlightNo',
  'routing',
  'Route',
  'acType',
  'TypeCraft',
  'std',
  'STDTime',
  'operations',
  'Typeofflight',
  'sta',
  'STATime',
  'staDate',
  'STADate',
  'stdDate',
  'STDDate',
  'loadingDiagramGivenAt',
  'loadgivenat',
  'loadingSheetPrintedAt',
  'loadprint',
  'loadingSheetDeliveredAt',
  'loaddelat',
  'flightPlanFieldAt',
  'fltfiled',
  'fic',
  'FICNO',
  'adc',
  'ADCNO',
]);

export const REMARKS_SCHEMA_KEYS = new Set<string>([
  'airline',
  'Airline',
  'flightNo',
  'FlightNo',
  'ghRemarks',
  'CALRem',
  'Pax_GHRemarks',
  'PaxGHAirlineRep_Name',
  'airlineRemarks',
  'AirRepRem',
  'Pax_AirlineRemarks',
  'airlineRep',
  'airrep',
  'ghRep',
  'PaxGHRep_Name',
  'PAX_Airline_SignByDate',
  'flightCancelled',
  'fltcancelled',
]);

export function schemaWhitelistFor(target: ImportTarget): Set<string> | null {
  switch (target) {
    case 'main':
      return MAIN_SCHEMA_KEYS;
    case 'terminal':
      return TERMINAL_SCHEMA_KEYS;
    case 'ramp':
      return RAMP_SCHEMA_KEYS;
    case 'loadControl':
      return LOAD_CONTROL_SCHEMA_KEYS;
    case 'remarks':
      return REMARKS_SCHEMA_KEYS;
    case 'fhr':
      return null;
    default:
      return null;
  }
}

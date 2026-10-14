const headers = [
  'slNo', 'airline', 'flightNo', 'regnNo', 'route', 'cabinBreakupF', 'cabinBreakupC',
  'cabinBreakupY', 'ldc', 'ldp', 'mdp', 'ops', 'TypeofHandling', 'acType', 'sta',
  'staDate', 'std', 'stdDate', 'ata', 'ataDate', 'atdTime', 'atdDate', 'etdTime',
  'ETDdate', 'delay', 'arrivalDelay', 'delay1', 'reasonOfDelay', 'delay2', 'delaycode2',
  'delay3', 'delaycode3', 'bayPlanned', 'bayFinal', 'gatePlanned', 'gateFinal', 'igm',
  'egm', 'adc', 'fic', 'passengerArrived', 'departed', 'mtow', 'holdOpenFrontDate',
  'holdOpenRearDate', 'holdOpenBulkDate', 'holdCloseFrontDate', 'holdCloseRearDate',
  'holdCloseBulkDate', 'holdOpenMainDeckDate', 'holdCloseMainDeckDate',
  'cleaningStartedDate', 'cleaningClosedDate', 'airlineRemarks', 'airlineRep',
  'arrivalBag', 'departureBag', 'firstBagArrivalHallTime', 'firstBagArrivalHallDate',
  'lastBagArrivalHallTime', 'lastBagArrivalHallDate', 'firstBagInBmaDate',
  'firstBagInBmaTime', 'lastBagInBmaDate', 'lastBagInBmaTime', 'arrivalUldCount',
  'depPlannedUldCount', 'depActualUldCount', 'arrivalCargoWeight', 'depActualCargoWeight',
  'depPlannedCargoWeight', 'arrivalMailWeight', 'depPlannedMailWeight',
  'depActualMailWeight', 'transitCargoUld', 'courierPcsIn', 'courierPcsOut',
  'counterOpen', 'counterClose', 'boardingOpen', 'boardingClose', 'arrivalWheelChairC',
  'arrivalWheelChairS', 'arrivalWheelChairR', 'cgoPcsIn', 'cgoPcsOut', 'flightCategory',
  'flightCode', 'terminalCode', 'arrivalFlightNo', 'departureFlightNo',
  'departureWheelChairC', 'departureWheelChairS', 'departureWheelChairR',
  'lastActivityHoldDate', 'lastActivityHoldTime', 'systemBagCount', 'ghRep', 'ghRemarks',
  'iposDate', 'iposTime',
];

const MAIN_SCHEMA_KEYS = new Set([
  'airlineName', 'airline', 'Airline', 'flightCode', 'Arline_Code', 'ifOperationSplit',
  'ArrivalFltNo', 'DepartureFltNo', 'ataDate', 'ataTime', 'ATADate', 'ATATime', 'atdDate',
  'atdTime', 'ATDDate', 'ATDTime', 'iposDate', 'iposTime', 'IPosDate', 'IPosTime',
  'etdDate', 'etdTime', 'ETDtime', 'regnNo', 'Regn', 'terminalCode', 'Terminal', 'route',
  'Route', 'ops', 'Typeofflight', 'TypeofHandling', 'typeOfHandling', 'flightCategory',
  'Cate_of_Flight', 'stationBaseNightHalt', 'aircraftType', 'TypeCraft', 'aircraftBody',
  'returnToRamp', 'stdLessThanSta', 'arrivalDelay', 'ActualDelay', 'departureStatus',
  'departureDelay', 'departureDelays', 'arrivalDelays', 'ghRep', 'PAX_Airline_SignByDate',
  'airlineRep', 'airrep', 'flightCancelled', 'MTOW', 'mtow',
]);
const TERMINAL_SCHEMA_KEYS = new Set([
  'airlinesOperator', 'flightNo', 'FlightNo', 'routing', 'operations', 'Typeofflight',
  'acType', 'TypeCraft', 'sta', 'STATime', 'staDate', 'STADate', 'std', 'STDTime',
  'stdDate', 'STDDate', 'igm', 'IGMNo', 'egm', 'EGMNo', 'dpr', 'ohd', 'offLoadPax', 'ahl',
  'gatePlanned', 'GatePlanned', 'gateFinal', 'GateFinal', 'counterOpen', 'cntclose',
  'counterClose', 'cntopen', 'systemBagCount', 'SystemBagCount',
  'boardingOpen', 'brdopen', 'boardingClose', 'brdclose', 'beltNo', 'passengerArrived',
  'arrivalpax', 'departed', 'deppax', 'transit', 'cabinBreakupF', 'CabincnfF',
  'cabinBreakupC', 'CabincnfC', 'cabinBreakupY', 'CabincnfY', 'arrivalWheelChairR', 'wcr',
  'arrivalWheelChairS', 'wcs', 'arrivalWheelChairC', 'wcc', 'departureWheelChairR',
  'Departure_wcr', 'departureWheelChairS', 'Departure_wcs', 'departureWheelChairC',
  'Departure_wcc',
]);
const RAMP_SCHEMA_KEYS = new Set([
  'airlinesOperator', 'flightNo', 'FlightNo', 'routing', 'Route', 'operations',
  'Typeofflight', 'etdDate', 'acType', 'TypeCraft', 'staDate', 'STADate', 'std', 'STDTime',
  'etd', 'sta', 'STATime', 'ata', 'ATATime', 'stdDate', 'STDDate', 'ataDate', 'ATADate',
  'bayPlanned', 'BayPlanned', 'bayFinal', 'BayFinal', 'arrivalBaggageCount',
  'firstBagArrivalHallDate', 'Fbarr', 'firstBagArrivalHallTime', 'bmaCount',
  'lastBagArrivalHallDate', 'Lbarr', 'bagreco', 'departureBag', 'lastBagArrivalHallTime', 'bbaBelt',
  'firstBagInBmaDate', 'Fbmup', 'firstBagInBmaTime', 'arrivalBag', 'airlinecount',
  'lastBagInBmaDate', 'Lbmup', 'lastBagInBmaTime', 'xRay', 'cleaningStartedDate',
  'CleaningFr', 'cleaningStartedTime', 'oneSidedBelt', 'customChecked',
  'cleaningClosedDate', 'CleaningTo', 'cleaningClosedTime', 'ldc', 'HoldCnfLDC', 'ldp',
  'HoldCnfLDP', 'mdp', 'HoldCnfMDP', 'holdConfig', 'cgoPcsIn', 'cgopcsin', 'cgoPcsOut',
  'cgopcout', 'courierPcsIn', 'Courierout', 'courierPcsOut', 'Courierin', 'ifNightHalt',
  'holdOpenFrontDate', 'Frontopen', 'holdOpenFrontTime', 'holdOpenRearDate', 'Rearopen',
  'holdOpenRearTime', 'holdOpenBulkDate', 'Bulkopen', 'holdOpenBulkTime',
  'holdOpenMainDeckDate', 'MDopen', 'holdOpenMainDeckTime', 'holdCloseFrontDate',
  'Frontclose', 'holdCloseFrontTime', 'holdCloseRearDate', 'Rearclose', 'holdCloseRearTime',
  'holdCloseBulkDate', 'Bulkclose', 'holdCloseBulkTime', 'holdCloseMainDeckDate', 'MDclose',
  'holdCloseMainDeckTime', 'lastActivityHoldDate', 'LasteActivityOnHold',
  'lastActivityHoldTime', 'arrivalUldCount', 'uldarr', 'arrivalCargoWeight', 'cgoarr',
  'arrivalMailWeight', 'mailarr', 'depPlannedUldCount', 'uldplan', 'depPlannedCargoWeight',
  'cgoactdep', 'depPlannedMailWeight', 'mailplan', 'depActualUldCount', 'uldatcdep',
  'depActualCargoWeight', 'cgoplan', 'depActualMailWeight', 'mailactdep', 'transitCargoUld',
  'transitcgo', 'transitCargoWeight', 'transitCargoMail',
]);
const LOAD_SCHEMA_KEYS = new Set([
  'airlinesOperator', 'flightNo', 'FlightNo', 'routing', 'acType', 'TypeCraft', 'std',
  'STDTime', 'operations', 'Typeofflight', 'sta', 'STATime', 'staDate', 'STADate',
  'stdDate', 'STDDate', 'loadingDiagramGivenAt', 'loadingSheetPrintedAt',
  'loadingSheetDeliveredAt', 'flightPlanFieldAt', 'fic', 'FICNO', 'adc', 'ADCNO',
]);
const REMARKS_SCHEMA_KEYS = new Set([
  'airline', 'Airline', 'flightNo', 'FlightNo', 'ghRemarks', 'PaxGHAirlineRep_Name',
  'airlineRemarks', 'AirRepRem', 'airlineRep', 'airrep', 'ghRep', 'PAX_Airline_SignByDate',
]);
const MAIN_RAW_KEYS = new Set([
  'airline', 'airlineName', 'Airline', 'flightNo', 'flightNumber', 'delay',
  'departureStatus', 'reasonOfDelay', 'arrivalFlightNo', 'departureFlightNo', 'ata',
  'ataTime', 'acType', 'aircraftType',
]);
const DROP = new Set([
  'delay1', 'delay2', 'delay3', 'delaycode2', 'delaycode3', 'ETDdate', 'mtow',
]);

const MONGOOSE = {
  main: new Set([
    'SerialNo', 'flightSerialNumber', 'Airline', 'Arline_Code', 'ifOperationSplit',
    'ArrivalFltNo', 'DepartureFltNo', 'ATADate', 'ATATime', 'ATDDate', 'ATDTime',
    'IPosDate', 'IPosTime', 'etdDate', 'ETDtime', 'Regn', 'Terminal', 'Route',
    'Typeofflight', 'TypeofHandling', 'Cate_of_Flight', 'stationBaseNightHalt',
    'TypeCraft', 'aircraftBody', 'returnToRamp', 'stdLessThanSta', 'MTOW', 'ActualDelay',
    'departureStatus', 'departureDelay', 'departureDelays', 'arrivalDelays',
    'PAX_Airline_SignByDate', 'airrep', 'flightCancelled', 'shareFhrToAirline',
    'shareReportsToGhRep',
  ]),
  terminal: new Set([
    'serialNo', 'airlinesOperator', 'FlightNo', 'routing', 'Typeofflight', 'TypeCraft',
    'STATime', 'STADate', 'STDTime', 'STDDate', 'IGMNo', 'EGMNo', 'dpr', 'ohd',
    'offLoadPax', 'ahl', 'GatePlanned', 'GateFinal', 'cntclose', 'cntopen',
    'SystemBagCount', 'brdopen', 'brdclose', 'beltNo', 'arrivalpax', 'deppax', 'transit',
    'CabincnfF', 'CabincnfC', 'CabincnfY', 'wcr', 'wcs', 'wcc', 'Departure_wcr',
    'Departure_wcs', 'Departure_wcc',
  ]),
  ramp: new Set([
    'serialNo', 'airlinesOperator', 'FlightNo', 'Route', 'Typeofflight', 'etdDate',
    'TypeCraft', 'STADate', 'STDTime', 'etd', 'STATime', 'ATATime', 'STDDate', 'ATADate',
    'BayPlanned', 'BayFinal', 'arrivalBaggageCount', 'Fbarr', 'firstBagArrivalHallDate',
    'firstBagArrivalHallTime', 'bmaCount', 'Lbarr', 'bagreco', 'lastBagArrivalHallDate',
    'lastBagArrivalHallTime', 'bbaBelt', 'Fbmup', 'firstBagInBmaDate', 'firstBagInBmaTime',
    'airlinecount', 'Lbmup', 'lastBagInBmaDate', 'lastBagInBmaTime', 'xRay', 'CleaningFr',
    'cleaningStartedTime', 'oneSidedBelt', 'customChecked', 'CleaningTo',
    'cleaningClosedTime', 'HoldCnfLDC', 'HoldCnfLDP', 'HoldCnfMDP', 'holdConfig',
    'cgopcsin', 'cgopcout', 'Courierout', 'Courierin', 'ifNightHalt', 'Frontopen',
    'holdOpenFrontTime', 'Rearopen', 'holdOpenRearTime', 'Bulkopen', 'holdOpenBulkTime',
    'MDopen', 'holdOpenMainDeckTime', 'Frontclose', 'holdCloseFrontTime', 'Rearclose',
    'holdCloseRearTime', 'Bulkclose', 'holdCloseBulkTime', 'MDclose',
    'holdCloseMainDeckTime', 'LasteActivityOnHold', 'lastActivityHoldTime', 'uldarr',
    'cgoarr', 'mailarr', 'uldplan', 'cgoactdep', 'mailplan', 'uldatcdep', 'cgoplan',
    'mailactdep', 'transitcgo', 'transitCargoWeight', 'transitCargoMail',
  ]),
  load: new Set([
    'serialNo', 'airlinesOperator', 'routing', 'TypeCraft', 'STDTime', 'FlightNo',
    'Typeofflight', 'STATime', 'STADate', 'STDDate', 'loadingDiagramGivenAt',
    'loadingSheetPrintedAt', 'loadingSheetDeliveredAt', 'flightPlanFieldAt', 'FICNO',
    'ADCNO',
  ]),
  remarks: new Set([
    'Airline', 'FlightNo', 'PaxGHAirlineRep_Name', 'ghRemarks', 'AirRepRem', 'airrep',
    'PAX_Airline_SignByDate',
  ]),
};

const MAIN_EXPLICIT = {
  airline: 'Airline',
  flightNo: 'Arline_Code',
  regnNo: 'Regn',
  route: 'Route',
  ops: 'Typeofflight',
  ataDate: 'ATADate',
  atdDate: 'ATDDate',
  atdTime: 'ATDTime',
  iposDate: 'IPosDate',
  iposTime: 'IPosTime',
  etdTime: 'ETDtime',
  terminalCode: 'Terminal',
  arrivalFlightNo: 'ArrivalFltNo',
  departureFlightNo: 'DepartureFltNo',
  flightCategory: 'Cate_of_Flight',
  ghRep: 'PAX_Airline_SignByDate',
  airlineRep: 'airrep',
  arrivalDelay: 'ActualDelay',
  ata: 'ATATime',
  ataTime: 'ATATime',
  acType: 'TypeCraft',
  aircraftType: 'TypeCraft',
  delay: 'departureStatus',
  TypeofHandling: 'TypeofHandling',
  etdDate: 'etdDate',
};

const TERMINAL_EXPLICIT = {
  ops: 'Typeofflight',
  route: 'routing',
  sta: 'STATime',
  std: 'STDTime',
  staDate: 'STADate',
  stdDate: 'STDDate',
};

const RAMP_EXPLICIT = {
  ops: 'Typeofflight',
  route: 'Route',
  ata: 'ATATime',
  sta: 'STATime',
  std: 'STDTime',
  staDate: 'STADate',
  stdDate: 'STDDate',
  ataDate: 'ATADate',
};

const LOAD_EXPLICIT = {
  ops: 'Typeofflight',
  route: 'routing',
  sta: 'STATime',
  std: 'STDTime',
  staDate: 'STADate',
  stdDate: 'STDDate',
};

const REMARKS_EXPLICIT = {
  airlineRemarks: 'AirRepRem',
  airlineRep: 'airrep',
  ghRep: 'PAX_Airline_SignByDate',
  ghRemarks: 'ghRemarks',
};

// Mirrors remapFlatPickedFields in maa-flat-import.util.ts
const FLAT_TERMINAL_KEY_REMAP = {
  cabinBreakupF: 'CabincnfF',
  cabinBreakupC: 'CabincnfC',
  cabinBreakupY: 'CabincnfY',
  gatePlanned: 'GatePlanned',
  gateFinal: 'GateFinal',
  igm: 'IGMNo',
  egm: 'EGMNo',
  counterOpen: 'cntopen',
  counterClose: 'cntclose',
  boardingOpen: 'brdopen',
  boardingClose: 'brdclose',
  passengerArrived: 'arrivalpax',
  departed: 'deppax',
  systemBagCount: 'SystemBagCount',
  arrivalWheelChairR: 'wcr',
  arrivalWheelChairS: 'wcs',
  arrivalWheelChairC: 'wcc',
  departureWheelChairR: 'Departure_wcr',
  departureWheelChairS: 'Departure_wcs',
  departureWheelChairC: 'Departure_wcc',
  acType: 'TypeCraft',
};
const FLAT_RAMP_KEY_REMAP = {
  bayPlanned: 'BayPlanned',
  bayFinal: 'BayFinal',
  ldc: 'HoldCnfLDC',
  ldp: 'HoldCnfLDP',
  mdp: 'HoldCnfMDP',
  arrivalBag: 'arrivalBaggageCount',
  departureBag: 'bagreco',
  cleaningStartedDate: 'CleaningFr',
  cleaningClosedDate: 'CleaningTo',
  holdOpenFrontDate: 'Frontopen',
  holdOpenRearDate: 'Rearopen',
  holdOpenBulkDate: 'Bulkopen',
  holdOpenMainDeckDate: 'MDopen',
  holdCloseFrontDate: 'Frontclose',
  holdCloseRearDate: 'Rearclose',
  holdCloseBulkDate: 'Bulkclose',
  holdCloseMainDeckDate: 'MDclose',
  lastActivityHoldDate: 'LasteActivityOnHold',
  cgoPcsIn: 'cgopcsin',
  cgoPcsOut: 'cgopcout',
  courierPcsIn: 'Courierin',
  courierPcsOut: 'Courierout',
  arrivalUldCount: 'uldarr',
  depPlannedUldCount: 'uldplan',
  depActualUldCount: 'uldatcdep',
  arrivalCargoWeight: 'cgoarr',
  depPlannedCargoWeight: 'cgoactdep',
  depActualCargoWeight: 'cgoplan',
  arrivalMailWeight: 'mailarr',
  depPlannedMailWeight: 'mailplan',
  depActualMailWeight: 'mailactdep',
  transitCargoUld: 'transitcgo',
  acType: 'TypeCraft',
};
const FLAT_LOAD_KEY_REMAP = {
  adc: 'ADCNO',
  fic: 'FICNO',
  acType: 'TypeCraft',
};

function remapPicked(picked, target) {
  const remap =
    target === 'terminal'
      ? FLAT_TERMINAL_KEY_REMAP
      : target === 'ramp'
        ? FLAT_RAMP_KEY_REMAP
        : FLAT_LOAD_KEY_REMAP;
  const out = {};
  for (const [key, val] of Object.entries(picked)) {
    if (!val) continue;
    out[remap[key] ?? key] = val;
  }
  return out;
}

const ALIAS_TO_MONGO = {
  terminal: FLAT_TERMINAL_KEY_REMAP,
  ramp: FLAT_RAMP_KEY_REMAP,
  load: FLAT_LOAD_KEY_REMAP,
};

const EXPLICIT_BY_TARGET = {
  main: MAIN_EXPLICIT,
  terminal: TERMINAL_EXPLICIT,
  ramp: RAMP_EXPLICIT,
  load: LOAD_EXPLICIT,
  remarks: REMARKS_EXPLICIT,
};

function targetsFor(key) {
  const t = new Set();
  for (const [name, wl] of [
    ['main', MAIN_SCHEMA_KEYS],
    ['terminal', TERMINAL_SCHEMA_KEYS],
    ['ramp', RAMP_SCHEMA_KEYS],
    ['load', LOAD_SCHEMA_KEYS],
    ['remarks', REMARKS_SCHEMA_KEYS],
  ]) {
    if (wl.has(key)) t.add(name);
  }
  if (MAIN_RAW_KEYS.has(key)) t.add('main');
  if (['ops', 'route', 'acType', 'sta', 'std', 'staDate', 'stdDate'].includes(key)) {
    for (const x of ['terminal', 'ramp', 'load']) t.add(x);
  }
  return [...t];
}

const unmapped = [];
const nameMismatch = [];
const ok = [];

for (const h of headers) {
  if (!h || h === 'slNo' || DROP.has(h)) continue;
  const targets = targetsFor(h);
  if (!targets.length) {
    unmapped.push(h);
    continue;
  }

  let hasMismatch = false;
  for (const target of targets) {
    const mongo = MONGOOSE[target];
    if (!mongo) continue;
    const remapTarget =
      target === 'load' ? 'load' : target === 'loadControl' ? 'load' : target;
    const remapped =
      remapTarget === 'terminal' || remapTarget === 'ramp' || remapTarget === 'load'
        ? remapPicked({ [h]: 'x' }, remapTarget)
        : {};
    const effectiveKey = Object.keys(remapped)[0] ?? h;
    if (mongo.has(effectiveKey)) continue;
    const explicit = EXPLICIT_BY_TARGET[target]?.[h];
    if (explicit && mongo.has(explicit)) continue;
    const alias = ALIAS_TO_MONGO[target]?.[h];
    if (alias && mongo.has(alias)) {
      hasMismatch = true;
      if (!nameMismatch.find((m) => m.header === h && m.target === target)) {
        nameMismatch.push({
          header: h,
          target,
          mongooseField: alias,
        });
      }
      continue;
    }
    if (target === 'main' && MAIN_SCHEMA_KEYS.has(h)) continue;
    if (target === 'remarks') continue;
  }
  if (!hasMismatch) ok.push(h);
}

console.log('=== SUMMARY ===');
console.log('Total data headers:', headers.length - 1);
console.log('Unmapped (dropped):', unmapped.length, unmapped);
console.log('Name mismatch (seeded under wrong key, lost on save):', nameMismatch.length);
console.log('OK / explicitly remapped:', ok.length);

for (const target of ['terminal', 'ramp', 'load', 'main']) {
  const rows = nameMismatch.filter((m) => m.target === target);
  if (!rows.length) continue;
  console.log(`\n--- ${target.toUpperCase()} (${rows.length}) ---`);
  for (const m of rows.sort((a, b) => a.header.localeCompare(b.header))) {
    console.log(`  ${m.header}  →  ${m.mongooseField}`);
  }
}

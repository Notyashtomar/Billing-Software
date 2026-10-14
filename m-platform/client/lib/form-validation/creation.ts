/**
 * Creation tab form validators (Scheduled Airlines, Additional Flights, RAF).
 * Pure — no React / toast.
 */

import {
  aircraftBody,
  airlineCode,
  compareDisplayDates,
  creationFlightNumber,
  displayDate,
  displayDateNotBefore,
  displayDateRange,
  flightRouting,
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  normalizeText,
  required,
  runValidators,
  selectRequired,
  time24,
  trimValue,
  type FieldErrors,
} from '@/lib/form-validation';

/** @deprecated Prefer FRIS_INVALID_CONTROL — kept for Creation form imports. */
export const CREATION_INVALID_CONTROL = FRIS_INVALID_CONTROL;
/** @deprecated Prefer FRIS_INVALID_PICKER_WRAP */
export const CREATION_INVALID_PICKER_WRAP = FRIS_INVALID_PICKER_WRAP;

/** Treat legacy placeholder "0" as empty aircraft type. */
function normalizeAcType(value: string): string {
  const v = trimValue(value);
  if (!v || v === '0') return '';
  return v;
}

// ─── Scheduled Airlines ─────────────────────────────────────────────────────

export const SCHEDULED_AIRLINES_FIELD_ORDER = [
  'airlines',
  'flightNo',
  'persistSerial',
  'acType',
  'routing',
  'staTime',
  'staDate',
  'aBody',
  'stdTime',
  'stdDate',
  'opsType',
  'skdNonSkd',
  'categoryOfFlight',
] as const;

export type ScheduledAirlinesField = (typeof SCHEDULED_AIRLINES_FIELD_ORDER)[number];

export type ScheduledAirlinesValues = {
  airlines: string;
  flightNo: string;
  persistSerial: string;
  acType: string;
  routing: string;
  staTime: string;
  staDate: string;
  aBody: string;
  stdTime: string;
  stdDate: string;
  opsType: string;
  skdNonSkd: string;
  categoryOfFlight: string;
};

/** STD datetime must be on/after STA datetime (same rules as form helper). */
export function scheduledStaStdTimingError(input: {
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
}): string | null {
  const staDateErr = displayDate(input.staDate, 'STA date');
  const stdDateErr = displayDate(input.stdDate, 'STD date');
  if (staDateErr || stdDateErr) return null;

  const staTimeErr = time24(input.staTime, 'STA time');
  const stdTimeErr = time24(input.stdTime, 'STD time');
  if (staTimeErr || stdTimeErr) return null;

  const toMs = (dateStr: string, timeStr: string): number | null => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimValue(dateStr));
    if (!m) return null;
    const t = /^(\d{2}):(\d{2})$/.exec(trimValue(timeStr));
    if (!t) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(t[1]), Number(t[2]));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };

  const staMs = toMs(input.staDate, input.staTime);
  const stdMs = toMs(input.stdDate, input.stdTime);
  if (staMs == null || stdMs == null) return 'STA and STD dates must be valid.';
  if (stdMs >= staMs) return null;
  return 'STD date and time must be on or after STA date and time.';
}

export function validateScheduledAirlinesForm(
  values: ScheduledAirlinesValues,
): FieldErrors<ScheduledAirlinesField> {
  const airlines = normalizeText(values.airlines);
  const flightNo = normalizeText(values.flightNo).toUpperCase().replace(/\s/g, '');
  const persistSerial = trimValue(values.persistSerial);
  const acType = normalizeAcType(values.acType);
  const routing = normalizeText(values.routing);
  const aBody = trimValue(values.aBody).toUpperCase();
  const staTime = trimValue(values.staTime);
  const stdTime = trimValue(values.stdTime);
  const staDate = trimValue(values.staDate);
  const stdDate = trimValue(values.stdDate);
  const opsType = trimValue(values.opsType);
  const skdNonSkd = trimValue(values.skdNonSkd);
  const categoryOfFlight = trimValue(values.categoryOfFlight);

  const errors: FieldErrors<ScheduledAirlinesField> = {};

  const airlinesErr = selectRequired(airlines, 'airline');
  if (airlinesErr) errors.airlines = airlinesErr;

  const flightErr = runValidators(
    required(flightNo, 'Flight number'),
    creationFlightNumber(flightNo),
  );
  if (flightErr) errors.flightNo = flightErr;

  if (!persistSerial) {
    errors.persistSerial =
      'Serial No is missing. Enter a serial and click Find Record, or use Airlines + Flight No.';
  }

  const acErr = selectRequired(acType, 'aircraft type');
  if (acErr) errors.acType = acErr;

  const routingErr = flightRouting(routing);
  if (routingErr) errors.routing = routingErr;

  const staTimeErr = runValidators(required(staTime, 'STA time'), time24(staTime, 'STA time'));
  if (staTimeErr) errors.staTime = staTimeErr;

  const staDateErr = runValidators(required(staDate, 'STA date'), displayDate(staDate, 'STA date'));
  if (staDateErr) errors.staDate = staDateErr;

  const bodyErr = runValidators(required(aBody, 'Aircraft body'), aircraftBody(aBody));
  if (bodyErr) errors.aBody = bodyErr;

  const stdTimeErr = runValidators(required(stdTime, 'STD time'), time24(stdTime, 'STD time'));
  if (stdTimeErr) errors.stdTime = stdTimeErr;

  const stdDateErr = runValidators(required(stdDate, 'STD date'), displayDate(stdDate, 'STD date'));
  if (stdDateErr) errors.stdDate = stdDateErr;

  const opsErr = selectRequired(opsType, 'ops type');
  if (opsErr) errors.opsType = opsErr;

  const skdErr = selectRequired(skdNonSkd, 'Skd/Non Skd');
  if (skdErr) errors.skdNonSkd = skdErr;

  const catErr = selectRequired(categoryOfFlight, 'category of flight');
  if (catErr) errors.categoryOfFlight = catErr;

  if (!errors.staDate && !errors.staTime && !errors.stdDate && !errors.stdTime) {
    const timing = scheduledStaStdTimingError({ staDate, staTime, stdDate, stdTime });
    if (timing) errors.stdDate = timing;
  }

  return errors;
}

// ─── Additional Flights ─────────────────────────────────────────────────────

export const ADDITIONAL_FLIGHTS_FIELD_ORDER = [
  'airlines',
  'flightNo',
  'acType',
  'routing',
  'staTime',
  'aBody',
  'stdTime',
  'opsType',
  'skdNonSkd',
  'airlineCode',
  'freighter',
  'staDate',
  'stdDate',
  'categoryOfFlight',
  'csvFile',
] as const;

export type AdditionalFlightsField = (typeof ADDITIONAL_FLIGHTS_FIELD_ORDER)[number];

export type AdditionalFlightsValues = {
  airlines: string;
  flightNo: string;
  acType: string;
  routing: string;
  staTime: string;
  aBody: string;
  stdTime: string;
  opsType: string;
  skdNonSkd: string;
  airlineCode: string;
  freighter: string;
  staDate: string;
  stdDate: string;
  categoryOfFlight: string;
};

export function validateAdditionalFlightsForm(
  values: AdditionalFlightsValues,
  todayDisplay: string,
): FieldErrors<AdditionalFlightsField> {
  const airlines = normalizeText(values.airlines);
  const flightNo = normalizeText(values.flightNo).toUpperCase().replace(/\s/g, '');
  const acType = normalizeAcType(values.acType);
  const routing = normalizeText(values.routing);
  const aBody = trimValue(values.aBody).toUpperCase();
  const staTime = trimValue(values.staTime);
  const stdTime = trimValue(values.stdTime);
  const airlineCodeVal = trimValue(values.airlineCode).toUpperCase();
  const freighter = trimValue(values.freighter);
  const staDate = trimValue(values.staDate);
  const stdDate = trimValue(values.stdDate);
  const opsType = trimValue(values.opsType);
  const skdNonSkd = trimValue(values.skdNonSkd);
  const categoryOfFlight = trimValue(values.categoryOfFlight);

  const errors: FieldErrors<AdditionalFlightsField> = {};

  const airlinesErr = selectRequired(airlines, 'airline');
  if (airlinesErr) errors.airlines = airlinesErr;

  const flightErr = runValidators(
    required(flightNo, 'Flight number'),
    creationFlightNumber(flightNo),
  );
  if (flightErr) errors.flightNo = flightErr;

  const acErr = selectRequired(acType, 'aircraft type');
  if (acErr) errors.acType = acErr;

  const routingErr = flightRouting(routing);
  if (routingErr) errors.routing = routingErr;

  const staTimeErr = runValidators(required(staTime, 'STA time'), time24(staTime, 'STA time'));
  if (staTimeErr) errors.staTime = staTimeErr;

  const bodyErr = aBody
    ? aircraftBody(aBody)
    : null;
  if (bodyErr) errors.aBody = bodyErr;

  const stdTimeErr = runValidators(required(stdTime, 'STD time'), time24(stdTime, 'STD time'));
  if (stdTimeErr) errors.stdTime = stdTimeErr;

  const opsErr = selectRequired(opsType, 'ops type');
  if (opsErr) errors.opsType = opsErr;

  const skdErr = selectRequired(skdNonSkd, 'Skd/Non Skd');
  if (skdErr) errors.skdNonSkd = skdErr;

  const codeErr = airlineCode(airlineCodeVal);
  if (codeErr) errors.airlineCode = codeErr;

  if (freighter && freighter !== 'Yes' && freighter !== 'No') {
    errors.freighter = 'Select Yes or No for Freighter.';
  }

  const staDateErr = runValidators(
    required(staDate, 'STA date'),
    displayDate(staDate, 'STA date'),
    displayDateNotBefore(staDate, todayDisplay, 'STA date', 'today'),
  );
  if (staDateErr) errors.staDate = staDateErr;

  const stdDateErr = runValidators(
    required(stdDate, 'STD date'),
    displayDate(stdDate, 'STD date'),
  );
  if (stdDateErr) {
    errors.stdDate = stdDateErr;
  } else if (!errors.staDate) {
    const rangeErr = displayDateRange(staDate, stdDate, 'STA date', 'STD date');
    if (rangeErr) errors.stdDate = rangeErr;
  }

  const catErr = selectRequired(categoryOfFlight, 'category of flight');
  if (catErr) errors.categoryOfFlight = catErr;

  return errors;
}

export function validateAdditionalFlightsImportFile(file: File | null): string | null {
  if (!file) return 'Choose a CSV or Excel file first.';
  const name = file.name.toLowerCase();
  const ok =
    name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls');
  if (!ok) return 'File must be CSV or Excel (.csv, .xlsx, .xls).';
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) return 'File must be 10 MB or smaller.';
  if (file.size === 0) return 'File is empty.';
  return null;
}

// ─── RAF ────────────────────────────────────────────────────────────────────

export const RAF_FIELD_ORDER = [
  'airlines',
  'flightNo',
  'airlineCode',
  'acType',
  'date',
  'routing',
  'staTime',
  'date2',
  'aBody',
  'stdTime',
  'opsType',
  'skdNonSkd',
  'categoryOfFlight',
] as const;

export type RafField = (typeof RAF_FIELD_ORDER)[number];

export type RafValues = {
  airlines: string;
  flightNo: string;
  airlineCode: string;
  acType: string;
  date: string;
  routing: string;
  staTime: string;
  date2: string;
  aBody: string;
  stdTime: string;
  opsType: string;
  skdNonSkd: string;
  categoryOfFlight: string;
};

export function validateRafForm(values: RafValues): FieldErrors<RafField> {
  const airlines = normalizeText(values.airlines);
  const flightNo = normalizeText(values.flightNo).toUpperCase().replace(/\s/g, '');
  const airlineCodeVal = trimValue(values.airlineCode).toUpperCase();
  const acType = normalizeAcType(values.acType);
  const routing = normalizeText(values.routing);
  const aBody = trimValue(values.aBody).toUpperCase();
  const staTime = trimValue(values.staTime);
  const stdTime = trimValue(values.stdTime);
  const date = trimValue(values.date);
  const date2 = trimValue(values.date2);
  const opsType = trimValue(values.opsType);
  const skdNonSkd = trimValue(values.skdNonSkd);
  const categoryOfFlight = trimValue(values.categoryOfFlight);

  const errors: FieldErrors<RafField> = {};

  const airlinesErr = selectRequired(airlines, 'airline');
  if (airlinesErr) errors.airlines = airlinesErr;

  const flightErr = runValidators(
    required(flightNo, 'Flight number'),
    creationFlightNumber(flightNo),
  );
  if (flightErr) errors.flightNo = flightErr;

  const codeErr = runValidators(
    required(airlineCodeVal, 'Airline code'),
    airlineCode(airlineCodeVal),
  );
  if (codeErr) errors.airlineCode = codeErr;

  const acErr = required(acType, 'Aircraft type');
  if (acErr) errors.acType = acErr;
  else if (acType.length > 40) errors.acType = 'Aircraft type must be at most 40 characters.';

  const dateErr = runValidators(required(date, 'STA date'), displayDate(date, 'STA date'));
  if (dateErr) errors.date = dateErr;

  const routingErr = flightRouting(routing);
  if (routingErr) errors.routing = routingErr;

  const staTimeErr = runValidators(required(staTime, 'STA time'), time24(staTime, 'STA time'));
  if (staTimeErr) errors.staTime = staTimeErr;

  const date2Err = runValidators(required(date2, 'STD date'), displayDate(date2, 'STD date'));
  if (date2Err) {
    errors.date2 = date2Err;
  } else if (!errors.date) {
    const rangeErr = displayDateRange(date, date2, 'STA date', 'STD date');
    if (rangeErr) errors.date2 = rangeErr;
  }

  const bodyErr = runValidators(required(aBody, 'Aircraft body'), aircraftBody(aBody));
  if (bodyErr) errors.aBody = bodyErr;

  const stdTimeErr = runValidators(required(stdTime, 'STD time'), time24(stdTime, 'STD time'));
  if (stdTimeErr) errors.stdTime = stdTimeErr;

  const opsErr = selectRequired(opsType, 'ops type');
  if (opsErr) errors.opsType = opsErr;

  const skdErr = selectRequired(skdNonSkd, 'Skd/Non Skd');
  if (skdErr) errors.skdNonSkd = skdErr;

  const catErr = selectRequired(categoryOfFlight, 'category of flight');
  if (catErr) errors.categoryOfFlight = catErr;

  if (
    !errors.date &&
    !errors.date2 &&
    !errors.staTime &&
    !errors.stdTime &&
    compareDisplayDates(date, date2) === 0
  ) {
    const timing = scheduledStaStdTimingError({
      staDate: date,
      staTime,
      stdDate: date2,
      stdTime,
    });
    if (timing) errors.stdTime = timing;
  }

  return errors;
}

/** Map common backend messages onto field keys when possible. */
export function mapCreationApiErrorToField(
  message: string,
): { field: string; message: string } | null {
  const lower = message.toLowerCase();
  if (lower.includes('airline')) return { field: 'airlines', message };
  if (lower.includes('flight')) return { field: 'flightNo', message };
  if (lower.includes('serial')) return { field: 'persistSerial', message };
  if (lower.includes('sta') && lower.includes('date')) return { field: 'staDate', message };
  if (lower.includes('std') && lower.includes('date')) return { field: 'stdDate', message };
  if (lower.includes('date2') || lower.includes('std date')) return { field: 'date2', message };
  if (lower.includes('aircraft') || lower.includes('ac type')) return { field: 'acType', message };
  return null;
}

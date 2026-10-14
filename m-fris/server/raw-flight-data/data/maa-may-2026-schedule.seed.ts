/**
 * Chennai (MAA) station – Advance Schedule Setup seed data for May 2026.
 *
 * Source: FRIS scheduled-airline timetable table (May 2026, MAA).
 * Default validity: 01/05/2026 → 31/05/2026.
 * Serial numbers: 420101 – 420128 (reserved block for MAA May-2026).
 */

interface ScheduleDays {
  Mon: boolean;
  Tue: boolean;
  Wed: boolean;
  Thu: boolean;
  Fri: boolean;
  Sat: boolean;
  Sun: boolean;
}

export interface MaaScheduleSeedRow {
  serialNo: string;
  airline: string;
  airlineCode: string;
  flightNo: string;
  ArrivalFltNo: string;
  DepartureFltNo: string;
  routing: string;
  aircraft: string;
  aircraftBody: 'NB' | 'WB';
  flightType: 'D' | 'I';
  typeOfHandling: string;
  staTime: string;
  stdTime: string;
  validFrom: string;
  validTo: string;
  scheduleDays: ScheduleDays;
  nextDay: 'Y' | 'N';
  freighter: 'Y' | 'N';
  active: boolean;
  flightStatus: string;
  scheduleSource: string;
}

const VALID_FROM = '01/05/2026';
const VALID_TO = '31/05/2026';

const every = (): ScheduleDays => ({
  Mon: true,
  Tue: true,
  Wed: true,
  Thu: true,
  Fri: true,
  Sat: true,
  Sun: true,
});

const days = (
  mon: boolean,
  tue: boolean,
  wed: boolean,
  thu: boolean,
  fri: boolean,
  sat: boolean,
  sun: boolean,
): ScheduleDays => ({
  Mon: mon,
  Tue: tue,
  Wed: wed,
  Thu: thu,
  Fri: fri,
  Sat: sat,
  Sun: sun,
});

const base = (
  serial: number,
  airline: string,
  airlineCode: string,
  flightNo: string,
  arrFlt: string,
  depFlt: string,
  routing: string,
  aircraft: string,
  body: 'NB' | 'WB',
  type: 'D' | 'I',
  sta: string,
  std: string,
  scheduleDays: ScheduleDays,
  nextDay: 'Y' | 'N' = 'N',
  validFrom: string = VALID_FROM,
  validTo: string = VALID_TO,
): MaaScheduleSeedRow => ({
  serialNo: String(serial).padStart(6, '0'),
  airline,
  airlineCode,
  flightNo,
  ArrivalFltNo: arrFlt,
  DepartureFltNo: depFlt,
  routing,
  aircraft,
  aircraftBody: body,
  flightType: type,
  typeOfHandling: 'PAX',
  staTime: sta,
  stdTime: std,
  validFrom,
  validTo,
  scheduleDays,
  nextDay,
  freighter: 'N',
  active: true,
  flightStatus: 'Open',
  scheduleSource: 'advance_schedule_setup',
});

export const MAA_MAY_2026_SCHEDULE_SEED: MaaScheduleSeedRow[] = [
  // ── Air India Express ──
  base(420101, 'Air India Express', 'IX', 'IX1168/2662', 'IX1168', 'IX2662',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '20:50', '21:25', every()),

  base(420102, 'Air India Express', 'IX', 'IX1472/1487', 'IX1472', 'IX1487',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '07:40', '08:55', every()),

  // w.e.f 30/04/2026 till 31/05/2026 (overnight departure)
  base(420103, 'Air India Express', 'IX', 'IX2787/2975', 'IX2787', 'IX2975',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '23:20', '05:50', every(), 'Y',
    '30/04/2026', VALID_TO),

  base(420104, 'Air India Express', 'IX', 'IX2926/2971', 'IX2926', 'IX2971',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '09:50', '10:45', every()),

  base(420105, 'Air India Express', 'IX', 'IX2942/1354', 'IX2942', 'IX1354',
    'BLR-MAA-GAU', 'B737/A320', 'NB', 'D', '13:50', '14:55', every()),

  base(420106, 'Air India Express', 'IX', 'IX1254/1256', 'IX1254', 'IX1256',
    'CCU-MAA-CCU', 'B737/A320', 'NB', 'D', '09:05', '09:40', every()),

  base(420107, 'Air India Express', 'IX', 'IX1259/1577', 'IX1259', 'IX1577',
    'CCU-MAA-CCU', 'B737/A320', 'NB', 'D', '19:00', '19:40', every()),

  base(420108, 'Air India Express', 'IX', 'IX2007/2661', 'IX2007', 'IX2661',
    'GAU-MAA-PNQ', 'B737/A320', 'NB', 'D', '21:20', '22:05', every()),

  base(420109, 'Air India Express', 'IX', 'IX2660/2786', 'IX2660', 'IX2786',
    'PNQ-MAA-BLR', 'B737/A320', 'NB', 'D', '02:10', '07:25', every()),

  // ── Biman Bangladesh Airlines ── Wed + Sat
  base(420110, 'Biman Bangladesh Airlines', 'BG', 'BG363/364', 'BG363', 'BG364',
    'DAC-MAA-DAC', 'B737-800', 'NB', 'I', '13:35', '14:35',
    days(false, false, true, false, false, true, false)),

  // ── Emirates ──
  base(420111, 'Emirates', 'EK', 'EK542/543', 'EK542', 'EK543',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '02:30', '04:05', every()),

  base(420112, 'Emirates', 'EK', 'EK544/545', 'EK544', 'EK545',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '08:05', '09:50', every()),

  base(420113, 'Emirates', 'EK', 'EK546/547', 'EK546', 'EK547',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '20:30', '22:05', every()),

  // ── Etihad Airways ──
  base(420114, 'Etihad Airways', 'EY', 'EY340/341', 'EY340', 'EY341',
    'AUH-MAA-AUH', 'A320-200', 'NB', 'I', '02:50', '04:05', every()),

  base(420115, 'Etihad Airways', 'EY', 'EY342/343', 'EY342', 'EY343',
    'AUH-MAA-AUH', 'A320-200', 'NB', 'I', '08:25', '10:15', every()),

  base(420116, 'Etihad Airways', 'EY', 'EY346/347', 'EY346', 'EY347',
    'AUH-MAA-AUH', 'A320-200', 'NB', 'I', '20:10', '21:55', every()),

  // ── Gulf Air ──
  base(420117, 'Gulf Air', 'GF', 'GF052/053', 'GF052', 'GF053',
    'BAH-MAA-BAH', 'A321', 'NB', 'I', '20:50', '21:35',
    days(false, false, false, false, true, true, true)),

  base(420118, 'Gulf Air', 'GF', 'GF068/069', 'GF068', 'GF069',
    'BAH-MAA-BAH', 'A321', 'NB', 'I', '05:20', '06:10',
    days(false, true, true, true, true, false, false)),

  // ── Lufthansa ──
  base(420119, 'Lufthansa', 'LH', 'LH758/759', 'LH758', 'LH759',
    'FRA-MAA-FRA', 'A340-300', 'WB', 'I', '00:10', '01:55', every()),

  // ── Royal Brunei Airlines ── Tue/Thu vs Sat timings differ
  base(420120, 'Royal Brunei Airlines', 'BI', 'BI121/122', 'BI121', 'BI122',
    'BWN-MAA-BWN', 'A320-200', 'NB', 'I', '22:50', '23:50',
    days(false, true, false, true, false, false, false)),

  base(420121, 'Royal Brunei Airlines', 'BI', 'BI121/122', 'BI121', 'BI122',
    'BWN-MAA-BWN', 'A320-200', 'NB', 'I', '03:30', '08:40',
    days(false, false, false, false, false, true, false)),

  // ── Sri Lankan Airlines ──
  base(420122, 'Sri Lankan Airlines', 'UL', 'UL121/122', 'UL121', 'UL122',
    'CMB-MAA-CMB', 'A330-300', 'WB', 'I', '08:50', '09:55', every()),

  base(420123, 'Sri Lankan Airlines', 'UL', 'UL123/124', 'UL123', 'UL124',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '20:10', '21:15', every()),

  // UL127: Mon/Wed/Thu/Fri/Sun 14:55-15:55
  base(420124, 'Sri Lankan Airlines', 'UL', 'UL127/128', 'UL127', 'UL128',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '14:55', '15:55',
    days(true, false, true, true, true, false, true)),

  // UL127: Tue/Sat 15:00-16:00
  base(420125, 'Sri Lankan Airlines', 'UL', 'UL127/128', 'UL127', 'UL128',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '15:00', '16:00',
    days(false, true, false, false, false, true, false)),

  // ── Thai Lion ── Mon + Wed + Thu + Sat
  base(420126, 'Thai Lion', 'SL', 'SL240/241', 'SL240', 'SL241',
    'DMK-MAA-DMK', 'B737-800', 'NB', 'I', '01:00', '02:00',
    days(true, false, true, true, false, true, false)),

  // ── US-Bangla Airlines ── Tue + Thu + Sat
  base(420127, 'US-Bangla Airlines', 'BS', 'BS205/206', 'BS205', 'BS206',
    'DAC-MAA-DAC', 'B737-800', 'NB', 'I', '12:55', '13:55',
    days(false, true, false, true, false, true, false)),
];

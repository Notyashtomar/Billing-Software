/**
 * Chennai (MAA) station – Advance Schedule Setup seed data for June 2026.
 *
 * Source: FRIS scheduled-airline timetable table (June 2026, MAA).
 * Default validity: 01/06/2026 → 30/06/2026.
 * Serial numbers: 420201 – 420228 (reserved block for MAA Jun-2026).
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

const VALID_FROM = '01/06/2026';
const VALID_TO = '30/06/2026';

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

export const MAA_JUNE_2026_SCHEDULE_SEED: MaaScheduleSeedRow[] = [
  // ── Air India Express ──
  base(420201, 'Air India Express', 'IX', 'IX1168/2662', 'IX1168', 'IX2662',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '20:50', '21:25', every()),

  base(420202, 'Air India Express', 'IX', 'IX1472/1385', 'IX1472', 'IX1385',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '08:10', '09:00', every()),

  base(420203, 'Air India Express', 'IX', 'IX2505/2507', 'IX2505', 'IX2507',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '18:20', '18:55', every()),

  base(420204, 'Air India Express', 'IX', 'IX2926/2971', 'IX2926', 'IX2971',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '09:50', '10:50', every()),

  base(420205, 'Air India Express', 'IX', 'IX2942/1354', 'IX2942', 'IX1354',
    'BLR-MAA-GAU', 'B737/A320', 'NB', 'D', '13:50', '14:55', every()),

  base(420206, 'Air India Express', 'IX', 'IX1254/1256', 'IX1254', 'IX1256',
    'CCU-MAA-CCU', 'B737/A320', 'NB', 'D', '09:05', '09:40', every()),

  base(420207, 'Air India Express', 'IX', 'IX1259/1577', 'IX1259', 'IX1577',
    'CCU-MAA-CCU', 'B737/A320', 'NB', 'D', '19:00', '19:40', every()),

  base(420208, 'Air India Express', 'IX', 'IX2007/2661', 'IX2007', 'IX2661',
    'GAU-MAA-PNQ', 'B737/A320', 'NB', 'D', '21:30', '22:05', every()),

  // IXB-MAA-IXB – no Tuesday
  base(420209, 'Air India Express', 'IX', 'IX2407/2408', 'IX2407', 'IX2408',
    'IXB-MAA-IXB', 'B737/A320', 'NB', 'D', '12:35', '15:25',
    days(true, false, true, true, true, true, true)),

  // w.e.f 02/06/2026 till 30/06/2026
  base(420210, 'Air India Express', 'IX', 'IX2660/2975', 'IX2660', 'IX2975',
    'PNQ-MAA-BLR', 'B737/A320', 'NB', 'D', '02:10', '06:25', every(), 'N',
    '02/06/2026', VALID_TO),

  // ── Biman Bangladesh Airlines ── Wed + Sat
  base(420211, 'Biman Bangladesh Airlines', 'BG', 'BG363/364', 'BG363', 'BG364',
    'DAC-MAA-DAC', 'B737-800', 'NB', 'I', '13:35', '14:35',
    days(false, false, true, false, false, true, false)),

  // ── Emirates ──
  base(420212, 'Emirates', 'EK', 'EK542/543', 'EK542', 'EK543',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '02:30', '04:05', every()),

  base(420213, 'Emirates', 'EK', 'EK544/545', 'EK544', 'EK545',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '08:05', '09:50', every()),

  base(420214, 'Emirates', 'EK', 'EK546/547', 'EK546', 'EK547',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '20:30', '22:05', every()),

  // ── Etihad Airways ──
  base(420215, 'Etihad Airways', 'EY', 'EY340/341', 'EY340', 'EY341',
    'AUH-MAA-AUH', 'A320-200', 'NB', 'I', '02:50', '04:05', every()),

  base(420216, 'Etihad Airways', 'EY', 'EY342/343', 'EY342', 'EY343',
    'AUH-MAA-AUH', 'A320-200', 'NB', 'I', '08:25', '10:15', every()),

  base(420217, 'Etihad Airways', 'EY', 'EY346/347', 'EY346', 'EY347',
    'AUH-MAA-AUH', 'A320-200', 'NB', 'I', '20:10', '21:55', every()),

  // ── Gulf Air ──
  base(420218, 'Gulf Air', 'GF', 'GF052/053', 'GF052', 'GF053',
    'BAH-MAA-BAH', 'A321', 'NB', 'I', '20:50', '21:35',
    days(false, false, false, false, true, true, true)),

  // Mon–Fri
  base(420219, 'Gulf Air', 'GF', 'GF068/069', 'GF068', 'GF069',
    'BAH-MAA-BAH', 'A321', 'NB', 'I', '05:20', '06:10',
    days(true, true, true, true, true, false, false)),

  // ── Lufthansa ── no Saturday
  base(420220, 'Lufthansa', 'LH', 'LH758/759', 'LH758', 'LH759',
    'FRA-MAA-FRA', 'A340-300', 'WB', 'I', '00:10', '01:55',
    days(true, true, true, true, true, false, true)),

  // ── Royal Brunei Airlines ──
  base(420221, 'Royal Brunei Airlines', 'BI', 'BI121/122', 'BI121', 'BI122',
    'BWN-MAA-BWN', 'A320-200', 'NB', 'I', '22:50', '23:50',
    days(false, true, false, true, false, false, false)),

  base(420222, 'Royal Brunei Airlines', 'BI', 'BI121/122', 'BI121', 'BI122',
    'BWN-MAA-BWN', 'A320-200', 'NB', 'I', '03:30', '08:40',
    days(false, false, false, false, false, true, false)),

  // ── Sri Lankan Airlines ──
  base(420223, 'Sri Lankan Airlines', 'UL', 'UL121/122', 'UL121', 'UL122',
    'CMB-MAA-CMB', 'A330-200', 'WB', 'I', '08:50', '09:55', every()),

  base(420224, 'Sri Lankan Airlines', 'UL', 'UL123/124', 'UL123', 'UL124',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '20:10', '21:15', every()),

  base(420225, 'Sri Lankan Airlines', 'UL', 'UL127/128', 'UL127', 'UL128',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '14:55', '15:55',
    days(true, false, true, true, true, false, true)),

  base(420226, 'Sri Lankan Airlines', 'UL', 'UL127/128', 'UL127', 'UL128',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '15:00', '16:00',
    days(false, true, false, false, false, true, false)),

  // ── Thai Lion ── Mon + Wed + Fri + Sun
  base(420227, 'Thai Lion', 'SL', 'SL240/241', 'SL240', 'SL241',
    'DMK-MAA-DMK', 'B737-800', 'NB', 'I', '01:00', '02:00',
    days(true, false, true, false, true, false, true)),

  // ── US-Bangla Airlines ── Tue + Thu + Sun
  base(420228, 'US-Bangla Airlines', 'BS', 'BS205/206', 'BS205', 'BS206',
    'DAC-MAA-DAC', 'B737-800', 'NB', 'I', '12:55', '13:55',
    days(false, true, false, true, false, false, true)),
];

/**
 * Chennai (MAA) station – Advance Schedule Setup seed data for April 2026.
 *
 * Source: FRIS scheduled-airline timetable table (April 2026, MAA).
 * Schedule validity: 01/04/2026 → 30/04/2026.
 *
 * Serial numbers: 420001 – 420026 (reserved block for MAA Apr-2026).
 * Fields follow the normalizeAdvanceSchedulePayload() contract
 * (raw-flight-data.service.ts) so they will be clean-written into
 * advance_schedule_setup.data by saveAdvanceScheduleSetup().
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

const VALID_FROM = '01/04/2026';
const VALID_TO = '30/04/2026';

// ---------- helpers --------------------------------------------------------

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
): ScheduleDays => ({ Mon: mon, Tue: tue, Wed: wed, Thu: thu, Fri: fri, Sat: sat, Sun: sun });

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
  validFrom: VALID_FROM,
  validTo: VALID_TO,
  scheduleDays,
  nextDay,
  freighter: 'N',
  active: true,
  flightStatus: 'Open',
  scheduleSource: 'advance_schedule_setup',
});

// --------------------------------------------------------------------------
// Flight data (sourced from MAA April 2026 scheduled-airlines timetable)
// --------------------------------------------------------------------------

export const MAA_APRIL_2026_SCHEDULE_SEED: MaaScheduleSeedRow[] = [
  // ── Air India Express ── (domestic routes within India, narrow-body)

  // BLR-MAA-BLR  IX1168/2662  20:50→21:25  daily
  base(420001, 'Air India Express', 'IX', 'IX1168/2662', 'IX1168', 'IX2662',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '20:50', '21:25', every()),

  // BLR-MAA-BLR  IX1472/1487  07:40→08:55  daily
  base(420002, 'Air India Express', 'IX', 'IX1472/1487', 'IX1472', 'IX1487',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '07:40', '08:55', every()),

  // BLR-MAA-BLR  IX2787/2786  23:20→07:25  daily  (next-day departure)
  base(420003, 'Air India Express', 'IX', 'IX2787/2786', 'IX2787', 'IX2786',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '23:20', '07:25', every(), 'Y'),

  // BLR-MAA-BLR  IX2787/2975  23:20→05:50  daily  (next-day departure)
  base(420004, 'Air India Express', 'IX', 'IX2787/2975', 'IX2787', 'IX2975',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '23:20', '05:50', every(), 'Y'),

  // BLR-MAA-BLR  IX2926/2971  09:50→10:45  daily
  base(420005, 'Air India Express', 'IX', 'IX2926/2971', 'IX2926', 'IX2971',
    'BLR-MAA-BLR', 'B737/A320', 'NB', 'D', '09:50', '10:45', every()),

  // BLR-MAA-GAU  IX2942/1354  13:50→14:55  daily
  base(420006, 'Air India Express', 'IX', 'IX2942/1354', 'IX2942', 'IX1354',
    'BLR-MAA-GAU', 'B737/A320', 'NB', 'D', '13:50', '14:55', every()),

  // CCU-MAA-CCU  IX1254/1256  09:05→09:40  daily
  base(420007, 'Air India Express', 'IX', 'IX1254/1256', 'IX1254', 'IX1256',
    'CCU-MAA-CCU', 'B737/A320', 'NB', 'D', '09:05', '09:40', every()),

  // CCU-MAA-CCU  IX1259/1577  19:00→19:40  daily
  base(420008, 'Air India Express', 'IX', 'IX1259/1577', 'IX1259', 'IX1577',
    'CCU-MAA-CCU', 'B737/A320', 'NB', 'D', '19:00', '19:40', every()),

  // GAU-MAA-PNQ  IX2007/2661  21:30→22:05  daily
  base(420009, 'Air India Express', 'IX', 'IX2007/2661', 'IX2007', 'IX2661',
    'GAU-MAA-PNQ', 'B737/A320', 'NB', 'D', '21:30', '22:05', every()),

  // PNQ-MAA-BLR  IX2660/2975  02:10→05:50  daily
  base(420010, 'Air India Express', 'IX', 'IX2660/2975', 'IX2660', 'IX2975',
    'PNQ-MAA-BLR', 'B737/A320', 'NB', 'D', '02:10', '05:50', every()),

  // ── Biman Bangladesh Airlines ── (international)

  // DAC-MAA-DAC  BG363/364  13:35→14:35  Thu + Sat
  base(420011, 'Biman Bangladesh Airlines', 'BG', 'BG363/364', 'BG363', 'BG364',
    'DAC-MAA-DAC', 'B737-800', 'NB', 'I', '13:35', '14:35',
    days(false, false, false, true, false, true, false)),

  // ── Emirates ── (international, wide-body)

  // DXB-MAA-DXB  EK542/543  02:30→04:05  daily
  base(420012, 'Emirates', 'EK', 'EK542/543', 'EK542', 'EK543',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '02:30', '04:05', every()),

  // DXB-MAA-DXB  EK544/545  08:05→09:50  daily
  base(420013, 'Emirates', 'EK', 'EK544/545', 'EK544', 'EK545',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '08:05', '09:50', every()),

  // DXB-MAA-DXB  EK546/547  20:30→22:05  daily
  base(420014, 'Emirates', 'EK', 'EK546/547', 'EK546', 'EK547',
    'DXB-MAA-DXB', 'B777-300ER', 'WB', 'I', '20:30', '22:05', every()),

  // ── Etihad Airways ── (international)

  // AUH-MAA-AUH  EY340/341  02:45→04:05  daily  (narrow-body A321)
  base(420015, 'Etihad Airways', 'EY', 'EY340/341', 'EY340', 'EY341',
    'AUH-MAA-AUH', 'A321', 'NB', 'I', '02:45', '04:05', every()),

  // AUH-MAA-AUH  EY346/347  20:15→21:55  daily  (wide-body B787-900)
  base(420016, 'Etihad Airways', 'EY', 'EY346/347', 'EY346', 'EY347',
    'AUH-MAA-AUH', 'B787-900', 'WB', 'I', '20:15', '21:55', every()),

  // ── Gulf Air ── (international)

  // BAH-MAA-BAH  GF052/053  20:50→21:35  Fri + Sat + Sun
  base(420017, 'Gulf Air', 'GF', 'GF052/053', 'GF052', 'GF053',
    'BAH-MAA-BAH', 'A321', 'NB', 'I', '20:50', '21:35',
    days(false, false, false, false, true, true, true)),

  // BAH-MAA-BAH  GF068/069  05:20→06:10  Tue + Wed + Thu + Fri
  base(420018, 'Gulf Air', 'GF', 'GF068/069', 'GF068', 'GF069',
    'BAH-MAA-BAH', 'A321', 'NB', 'I', '05:20', '06:10',
    days(false, true, true, true, true, false, false)),

  // ── Lufthansa ── (international, wide-body)

  // FRA-MAA-FRA  LH758/759  00:10→01:55  daily
  base(420019, 'Lufthansa', 'LH', 'LH758/759', 'LH758', 'LH759',
    'FRA-MAA-FRA', 'A340-300', 'WB', 'I', '00:10', '01:55', every()),

  // ── Royal Brunei Airlines ── (international) – 3 days, two timing variants
  //   Tue + Thu operate 22:50→23:50
  base(420020, 'Royal Brunei Airlines', 'BI', 'BI121/122', 'BI121', 'BI122',
    'BWN-MAA-BWN', 'A320-200', 'NB', 'I', '22:50', '23:50',
    days(false, true, false, true, false, false, false)),

  //   Sat operates 03:20→04:20 (different timing due to overnight BWN departure)
  base(420021, 'Royal Brunei Airlines', 'BI', 'BI121/122', 'BI121', 'BI122',
    'BWN-MAA-BWN', 'A320-200', 'NB', 'I', '03:20', '04:20',
    days(false, false, false, false, false, true, false)),

  // ── Sri Lankan Airlines ── (international)

  // CMB-MAA-CMB  UL121/122  08:50→09:55  daily  (A330-300 wide-body)
  base(420022, 'Sri Lankan Airlines', 'UL', 'UL121/122', 'UL121', 'UL122',
    'CMB-MAA-CMB', 'A330-300', 'WB', 'I', '08:50', '09:55', every()),

  // CMB-MAA-CMB  UL123/124  20:10→21:15  daily  (A320-200 narrow-body)
  base(420023, 'Sri Lankan Airlines', 'UL', 'UL123/124', 'UL123', 'UL124',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '20:10', '21:15', every()),

  // CMB-MAA-CMB  UL127/128  14:55→15:55  daily  (A320-200 narrow-body)
  base(420024, 'Sri Lankan Airlines', 'UL', 'UL127/128', 'UL127', 'UL128',
    'CMB-MAA-CMB', 'A320-200', 'NB', 'I', '14:55', '15:55', every()),

  // ── Thai Lion ── (international)

  // DMK-MAA-DMK  SL240/241  01:00→02:00  Mon + Wed + Fri + Sun
  base(420025, 'Thai Lion', 'SL', 'SL240/241', 'SL240', 'SL241',
    'DMK-MAA-DMK', 'B737-800', 'NB', 'I', '01:00', '02:00',
    days(true, false, true, false, true, false, true)),

  // ── US-Bangla Airlines ── (international)

  // DAC-MAA-DAC  BS205/206  12:55→13:55  Tue + Thu + Sat
  base(420026, 'US-Bangla Airlines', 'BS', 'BS205/206', 'BS205', 'BS206',
    'DAC-MAA-DAC', 'B737-800', 'NB', 'I', '12:55', '13:55',
    days(false, true, false, true, false, true, false)),
];

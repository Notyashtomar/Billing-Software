/**
 * Hyderabad (HYD) Advance → Schedule Setup rows from
 * `Flight Schedule.pdf` (Station HYD, 03/09/2026).
 *
 * Flight numbers have no spaces/hyphens. Category is Domestic or International.
 * Air Asia Berhard AK67/66 and AK69/68 are omitted — already in HYD.
 */

export interface HydScheduleDays {
  Mon: boolean;
  Tue: boolean;
  Wed: boolean;
  Thu: boolean;
  Fri: boolean;
  Sat: boolean;
  Sun: boolean;
}

export interface HydScheduleSeedRow {
  airlineCode: string;
  flightNo: string;
  arrivalFlightNo: string;
  departureFlightNo: string;
  routing: string;
  aircraft: string;
  aircraftBody: 'NB' | 'WB';
  flightType: 'Domestic' | 'International';
  typeOfHandling: string;
  staTime: string;
  stdTime: string;
  validFrom: string;
  validTo: string;
  scheduleDays: HydScheduleDays;
  nextDay: boolean;
  freighter: boolean;
  notes?: string;
}

const none = (): HydScheduleDays => ({
  Mon: false,
  Tue: false,
  Wed: false,
  Thu: false,
  Fri: false,
  Sat: false,
  Sun: false,
});

const days = (
  flags: Partial<HydScheduleDays>,
): HydScheduleDays => ({
  ...none(),
  ...flags,
});

const daily = (): HydScheduleDays => ({
  Mon: true,
  Tue: true,
  Wed: true,
  Thu: true,
  Fri: true,
  Sat: true,
  Sun: true,
});

function splitPair(
  flightNo: string,
  airlineCode: string,
): { arr: string; dep: string } {
  const [left, right] = flightNo.split('/');
  if (!right) return { arr: left, dep: '' };
  if (/^[A-Z]/.test(right)) return { arr: left, dep: right };
  return { arr: left, dep: `${airlineCode}${right}` };
}

function row(
  airlineCode: string,
  flightNo: string,
  routing: string,
  aircraft: string,
  aircraftBody: 'NB' | 'WB',
  flightType: 'Domestic' | 'International',
  typeOfHandling: string,
  staTime: string,
  stdTime: string,
  validFrom: string,
  validTo: string,
  scheduleDays: HydScheduleDays,
  extra: Partial<Pick<HydScheduleSeedRow, 'nextDay' | 'freighter' | 'notes'>> = {},
): HydScheduleSeedRow {
  const { arr, dep } = splitPair(flightNo, airlineCode);
  return {
    airlineCode,
    flightNo,
    arrivalFlightNo: arr,
    departureFlightNo: dep,
    routing,
    aircraft,
    aircraftBody,
    flightType,
    typeOfHandling,
    staTime,
    stdTime,
    validFrom,
    validTo,
    scheduleDays,
    nextDay: extra.nextDay === true,
    freighter: extra.freighter === true,
    notes: extra.notes,
  };
}

/** Cargo airlines missing from HYD Advance → Airline master. */
export const HYD_SEP_2026_AIRLINES_TO_ENSURE: Array<{
  name: string;
  code: string;
}> = [
  { name: 'Qatar Cargo Airways', code: 'QRC' },
  { name: 'Turkish Cargo', code: 'TK' },
];

export const HYD_SEP_2026_SCHEDULE_SEED: HydScheduleSeedRow[] = [
  row(
    'G9',
    'G9467/468',
    'SHJ-HYD-SHJ',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '03:40',
    '04:20',
    '30/03/2026',
    '26/10/2026',
    daily(),
  ),
  row(
    'QP',
    'QP1406/1407',
    'DEL-HYD-DEL',
    'B737-8MA',
    'NB',
    'Domestic',
    'Turnaround',
    '16:30',
    '17:30',
    '02/09/2026',
    '30/09/2026',
    daily(),
  ),
  row(
    'QP',
    'QP1409/1405',
    'DEL-HYD-DEL',
    'B737-8MA',
    'NB',
    'Domestic',
    'Turnaround',
    '23:10',
    '06:00',
    '31/08/2026',
    '30/09/2026',
    daily(),
    { nextDay: true },
  ),
  row(
    'F3',
    'F3665/666',
    'RUH-HYD-RUH',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '06:50',
    '07:55',
    '04/07/2026',
    '24/10/2026',
    days({ Tue: true, Thu: true, Fri: true, Sat: true, Sun: true }),
  ),
  row(
    'GF',
    'GF274/275',
    'BAH-HYD-BAH',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '05:15',
    '06:05',
    '02/06/2026',
    '26/10/2026',
    days({ Mon: true, Tue: true, Wed: true, Sat: true, Sun: true }),
  ),
  row(
    'GF',
    'GF276/277',
    'BAH-HYD-BAH',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '21:20',
    '22:10',
    '02/06/2026',
    '26/10/2026',
    days({ Tue: true, Thu: true, Sat: true }),
  ),
  row(
    'J9',
    'J9403/404',
    'KWI-HYD-KWI',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '01:45',
    '02:30',
    '02/09/2026',
    '30/09/2026',
    days({ Wed: true, Thu: true, Sun: true }),
  ),
  row(
    'KL',
    'KL876/874',
    'AMS-HYD-AMS',
    'B787',
    'WB',
    'International',
    'Turnaround',
    '00:30',
    '02:20',
    '30/03/2026',
    '26/10/2026',
    days({ Mon: true, Wed: true, Sat: true }),
  ),
  row(
    'KU',
    'KU373/374',
    'KWI-HYD-KWI',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '03:00',
    '03:55',
    '02/06/2026',
    '26/10/2026',
    daily(),
  ),
  row(
    'LH',
    'LH752/753',
    'FRA-HYD-FRA',
    'B787-9',
    'WB',
    'International',
    'Turnaround',
    '01:15',
    '03:10',
    '29/03/2026',
    '24/10/2026',
    days({ Mon: true, Tue: true, Thu: true, Fri: true, Sun: true }),
  ),
  row(
    'QR',
    'QR500/501',
    'DOH-HYD-DOH',
    'B787',
    'WB',
    'International',
    'Turnaround',
    '02:00',
    '03:30',
    '29/03/2026',
    '24/10/2026',
    daily(),
  ),
  row(
    'OV',
    'OV735/736',
    'MCT-HYD-MCT',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '03:25',
    '04:15',
    '16/08/2026',
    '24/10/2026',
    daily(),
    {
      notes:
        'PDF Tuesday cell is 04:10-05:05; stored as 03:25-04:15 with the other six days (one STA/STD per flight).',
    },
  ),
  row(
    'UL',
    'UL175/176',
    'CMB-HYD-CMB',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '19:50',
    '20:45',
    '29/03/2026',
    '26/10/2026',
    days({ Mon: true, Thu: true }),
  ),
  row(
    'UL',
    'UL177/178',
    'CMB-HYD-CMB',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '12:35',
    '13:30',
    '29/03/2026',
    '26/10/2026',
    days({ Fri: true, Sun: true }),
  ),
  row(
    'UL',
    'UL177',
    'CMB-HYD-CMB',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '09:20',
    '10:15',
    '29/03/2026',
    '26/10/2026',
    days({ Wed: true }),
    {
      notes:
        'Same PDF flight as UL177/178 on Wednesday at 09:20-10:15; stored as UL177 so times are not overwritten.',
    },
  ),
  row(
    'S5',
    'S5196',
    'HYD-NDC',
    'E175',
    'NB',
    'Domestic',
    'Originate',
    '06:20',
    '07:20',
    '03/09/2026',
    '03/09/2026',
    days({ Thu: true }),
  ),
  row(
    'S5',
    'S5212',
    'HYD-RQY',
    'E175',
    'NB',
    'Domestic',
    'Originate',
    '08:30',
    '09:30',
    '03/09/2026',
    '03/09/2026',
    days({ Thu: true }),
  ),
  row(
    'S5',
    'S5197',
    'NDC-HYD',
    'E175',
    'NB',
    'Domestic',
    'Terminate',
    '20:30',
    '21:05',
    '03/09/2026',
    '03/09/2026',
    days({ Thu: true }),
  ),
  row(
    'S5',
    'S5213',
    'RQY-HYD',
    'E175',
    'NB',
    'Domestic',
    'Terminate',
    '18:20',
    '18:55',
    '03/09/2026',
    '03/09/2026',
    days({ Thu: true }),
  ),
  row(
    'VJ',
    'VJ1803/1804',
    'SGN-HYD-SGN',
    'A320',
    'NB',
    'International',
    'Turnaround',
    '22:35',
    '23:35',
    '29/03/2026',
    '26/10/2026',
    days({ Tue: true, Thu: true, Sat: true }),
  ),
  row(
    'QRC',
    'QR8650/8651',
    'DOH-HYD-DOH',
    'B777F',
    'WB',
    'International',
    'Turnaround',
    '07:45',
    '09:45',
    '02/09/2026',
    '30/09/2026',
    days({ Wed: true, Sat: true }),
    { freighter: true },
  ),
  row(
    'TK',
    'TK6140/6140',
    'DOH-HYD-IST',
    'A330F',
    'WB',
    'International',
    'Transit',
    '02:15',
    '04:15',
    '03/09/2026',
    '03/09/2026',
    days({ Thu: true }),
    { freighter: true },
  ),
];

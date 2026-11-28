/**
 * Remote and contact bays per station, from the operations "Bay Details" workbook.
 * ADS rules such as "FOC for Remote Bay" are decided from the bay on the flight report.
 */

export type StationBayType = 'remote' | 'contact';

/** Bay numbers `from`..`to` under one letter prefix. Numeric bays use an empty prefix. */
type BayBand = { prefix: string; from: number; to: number };

const band = (prefix: string, from: number, to = from): BayBand => ({ prefix, from, to });
const each = (prefix: string, numbers: number[]): BayBand[] =>
  numbers.map((number) => band(prefix, number));

const STATION_BAYS: Record<string, { contact: BayBand[]; remote: BayBand[] }> = {
  DEL: {
    contact: [
      // T1: 101 to 122 are contact, everything beyond is remote.
      band('', 101, 122),
      // T2
      band('', 201, 202),
      band('', 208, 209),
      band('', 211),
      // T3 international (left / right positions share the bay number)
      ...each('A', [1, 3, 6, 7, 8, 9, 10, 11, 12, 13]),
      ...each('B', [15, 17, 18, 19, 20, 21, 22, 24, 26]),
      // T3 domestic: C27 to D62
      band('C', 27, 62),
      band('D', 27, 62),
    ],
    remote: [
      band('', 123, 199),
      // T2
      band('', 203, 207),
      band('', 210),
      band('', 212, 246),
      // Cargo
      band('', 252, 257),
      band('', 260, 265),
      // T3 international and domestic
      band('R', 1, 12),
      band('E', 64, 84),
    ],
  },
  IMF: { contact: [], remote: [band('', 1, 6)] },
  IXA: { contact: [band('', 7, 10)], remote: [band('', 6)] },
  TRZ: { contact: each('', [11, 12, 14, 16, 18]), remote: [band('', 20)] },
};

/**
 * `A-08 R`, `A08R` and `a8r` are the same bay. When two bays are written
 * (`A07/B19`), the first one is where the flight was handled.
 */
function parseBay(raw: unknown): { prefix: string; number: number } | null {
  const first = String(raw ?? '').toUpperCase().split(/[\/,&]/)[0] ?? '';
  const match = first.replace(/[^A-Z0-9]/g, '').match(/^([A-Z]?)0*(\d{1,3})[A-Z]?$/);
  if (!match) return null;
  return { prefix: match[1], number: Number(match[2]) };
}

/** Remote or contact for this station's bay. Null when the bay is blank or not in the workbook. */
export function classifyStationBay(stationCode: unknown, bay: unknown): StationBayType | null {
  const station = STATION_BAYS[String(stationCode ?? '').trim().toUpperCase()];
  const parsed = parseBay(bay);
  if (!station || !parsed) return null;
  const inside = (bands: BayBand[]) =>
    bands.some(
      (item) => item.prefix === parsed.prefix && parsed.number >= item.from && parsed.number <= item.to,
    );
  if (inside(station.contact)) return 'contact';
  if (inside(station.remote)) return 'remote';
  return null;
}

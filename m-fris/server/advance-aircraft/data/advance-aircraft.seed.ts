/**
 * Additional gateway aircraft types for Advance → Aircraft (global `advance-aircraft` catalog).
 * Names match the station master list; normalizer uppercases and hyphenates spaces.
 */
export type AdvanceAircraftSeedRow = {
  aircraft: string;
  aircraftBody?: 'NB' | 'WB';
  category?: 'A' | 'B' | 'C' | 'D' | 'E';
  description?: string;
};

/** Infer NB/WB and ICAO aerodrome reference code A–E from type name. */
export function inferAircraftSeedMeta(raw: string): {
  aircraftBody: 'NB' | 'WB';
  category: 'A' | 'B' | 'C' | 'D' | 'E';
} {
  const u = raw.toUpperCase().replace(/\s+/g, '');

  // Helicopters / light rotorcraft → A
  if (
    /^(AW|AS|EC|MI|SIKORSKY|AUGUSTA)/.test(u) ||
    /AW139|AW169|AS350|B407|B429|B412|H125|H130|MI172|EC-?130|B412EP/.test(u)
  ) {
    return { aircraftBody: 'NB', category: 'A' };
  }

  // Commercial narrowbodies / regional jets → C
  if (/B737|A320|A319|EMB.?175|E175|ERJ|EMB.?145|E135|E35L/.test(u)) {
    return { aircraftBody: 'NB', category: 'C' };
  }

  // Large business jets / long-range → C
  if (
    /GLEX|G650|G550|G5000|GLOBAL|GL-?6000|GL-?6500|GL5T|BD-700|FALCON.?7|F2000|CL605|CL60|G450|G280|GLF/.test(
      u,
    )
  ) {
    return { aircraftBody: 'NB', category: 'C' };
  }

  // Twin Otter / C130 / turboprops of medium size → B/C
  if (/C130|TWINOTTER|DHC-?6/.test(u)) {
    return { aircraftBody: 'NB', category: 'B' };
  }

  // Default light/medium bizjet & turboprop → B
  return { aircraftBody: 'NB', category: 'B' };
}

/**
 * Raw type labels from gateway aircraft master (preserve spelling as provided).
 * Duplicate labels that normalize to the same key are fine — bulk upsert is idempotent.
 */
const RAW_AIRCRAFT_TYPES: string[] = [
  'F2000',
  'GLEX',
  'G5000',
  'G 200',
  'Legacy 650',
  'AW 139',
  'B429',
  'B 200',
  'CITATION',
  'H-25B',
  'H900XP',
  'LJ - 45',
  'ERJ 135 LR',
  'AS 350 B3',
  'A 109S',
  'H125',
  'CC 560 XL',
  'SKA-B200',
  'A 109 E',
  'CE 560 XL',
  'SKB-200',
  'PREMIER I',
  'B-200 GT',
  'F2TH',
  'H 850XP',
  'A-109',
  'Embraer 135',
  'B 407',
  'Cessna C12',
  'H 800XP',
  'AS 350',
  'C160',
  'C-90 A',
  'E35L',
  'AUGUSTA',
  'B 350',
  'C-90',
  'B412EP',
  'Twin Otter',
  'CHALLENGER',
  'SIKORSKY',
  'Phenom 300',
  'C 56X',
  'LJ60',
  'Gulfstream',
  'CL605',
  'B737-800',
  'H - 400',
  'DHC-6',
  'FALCON 2000',
  'G-400',
  'HA4T',
  'Global 7500',
  'E135',
  'C670',
  'P1A',
  'PREMIER 1',
  'B 300',
  'BEECHCRAFT',
  'EMB - 145 P',
  'Citation M2',
  'GL75',
  'C130',
  'H130',
  'H800XP',
  'G-150',
  'G50C',
  'Pilatus PC-12',
  'BD-700',
  'GL-6000',
  'B737',
  'C25A',
  'A320',
  'FALCON 7X',
  'EC-130 T2',
  'EMB 175',
  'A319',
  'B737-900',
  'CESSNA 680',
  'H 4000',
  'GL5T',
  'G-550',
  'MI 172',
  'F2000LX',
  'Falcon-2000',
  'GL-150',
  'H 750',
  'PILATUS-12',
  'Cessna 208',
  'GLF6',
  'E-550',
  'E-135',
  'B737-8MA',
  'F2000EX',
  'Falcon 900',
  'GL-6500',
  'G-650',
  'G 450',
  'BE-200',
  'AW 169',
  'G 280',
  'CC 560 XLS',
  'GLF 4',
];

export const ADVANCE_AIRCRAFT_SEED: AdvanceAircraftSeedRow[] = RAW_AIRCRAFT_TYPES.map(
  (aircraft) => {
    const meta = inferAircraftSeedMeta(aircraft);
    return {
      aircraft,
      aircraftBody: meta.aircraftBody,
      category: meta.category,
      description: aircraft,
    };
  },
);

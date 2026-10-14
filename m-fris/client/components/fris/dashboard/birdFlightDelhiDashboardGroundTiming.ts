/**
 * ================================
 * ✈️ FLIGHT TIMING DEFINITIONS
 * ================================
 *
 * ADA (Actual Date of Arrival)
 * → Actual time when the flight arrives at the airport
 *
 * STA (Scheduled Time of Arrival)
 * → Scheduled arrival time of the flight
 *
 * ATD (Actual Time of Departure)
 * → Actual time when the flight departs from the airport
 *
 * STD (Scheduled Time of Departure)
 * → Scheduled departure time of the flight
 *
 * --------------------------------
 * ⏱️ GROUND TIME CALCULATIONS
 * --------------------------------
 *
 * AGT (Actual Ground Time)
 * → Time taken by ground handling team
 * → AGT = ATD - ADA
 *
 * SGT (Scheduled Ground Time)
 * → Planned handling time
 * → SGT = STD - STA
 *
 * --------------------------------
 * ⚠️ IMPORTANT RULES
 * --------------------------------
 * - Always use FULL datetime (date + time)
 * - Never compare only time (HH:mm)
 * - All calculations must use milliseconds
 * - Flights crossing midnight must be handled correctly
 *
 * --------------------------------
 * 🎯 PURPOSE
 * --------------------------------
 * These definitions are used across:
 * - OTP Matrix
 * - Performance Report (Row 1, 2, 3A, 3B, 3C)
 * - Ground Time calculations
 *
 * This block acts as the SINGLE SOURCE OF TRUTH.
 */

type FlightTimingInput = {
  ata?: string | null;
  atd?: string | null;
  sta?: string | null;
  std?: string | null;
};

export type GroundTimes = {
  ata: number;
  atd: number;
  sta: number;
  std: number;
  AGT: number;
  SGT: number;
};

/**
 * Parse datetime safely.
 */
export const parseTimeMs = (t?: string | null): number | null => {
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Calculate AGT (Actual Ground Time).
 */
export const getAGT = (ata: number, atd: number): number => {
  return atd - ata;
};

/**
 * Calculate SGT (Scheduled Ground Time).
 */
export const getSGT = (sta: number, std: number): number => {
  return std - sta;
};

export const getGroundTimes = (f: FlightTimingInput): GroundTimes | null => {
  const ata = parseTimeMs(f.ata);
  const atd = parseTimeMs(f.atd);
  const sta = parseTimeMs(f.sta);
  const std = parseTimeMs(f.std);

  if (ata == null || atd == null || sta == null || std == null) {
    return null;
  }

  return {
    ata,
    atd,
    sta,
    std,
    AGT: getAGT(ata, atd),
    SGT: getSGT(sta, std),
  };
};

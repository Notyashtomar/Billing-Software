import type { PerformanceFlightFromDb } from '@/utils/performanceFlightsFromDb';
import { getGroundTimes } from '@/utils/flightGroundTiming';

/** Matches performance-report cancelled count / drill-down (DB legs only). */
export function isCancelledDbPerformanceFlight(f: PerformanceFlightFromDb): boolean {
  if (f.isCancelled === true) return true;
  const fn = (f.flightNo || '').toUpperCase();
  return fn.startsWith('CANC');
}

function matchesOtpBeforeStaGtLeStdCell(
  ataMs: number,
  staMs: number,
  atdMs: number,
  stdMs: number,
  agtMs: number,
  sgtMs: number,
): boolean {
  return ataMs < staMs && agtMs > sgtMs && atdMs <= stdMs;
}

function matchesOtpGtGtStdCell(
  ataMs: number,
  staMs: number,
  atdMs: number,
  stdMs: number,
  agtMs: number,
  sgtMs: number,
): boolean {
  return agtMs > sgtMs && atdMs > stdMs && ataMs > staMs;
}

/** Row 1, column 3 flights: ATA < STA, AGT > SGT, ATD <= STD (full datetime ms). */
export function listOtpBeforeStaGtLeStdFlights(
  legs: PerformanceFlightFromDb[],
): PerformanceFlightFromDb[] {
  const out: PerformanceFlightFromDb[] = [];
  for (const f of legs) {
    if (f.isCancelled || isCancelledDbPerformanceFlight(f)) continue;
    const gt = getGroundTimes(f);
    if (!gt) continue;
    const { ata: ataMs, sta: staMs, atd: atdMs, std: stdMs, AGT: agtMs, SGT: sgtMs } = gt;
    if (matchesOtpBeforeStaGtLeStdCell(ataMs, staMs, atdMs, stdMs, agtMs, sgtMs)) {
      out.push(f);
    }
  }
  return out;
}

/**
 * 3×4 OTP matrix derived from Mongo `fhr_collection` timings (dashboard range legs).
 *
 * **SGT** = scheduled ground window **STD−STA** (STA and STD full instants).
 * **AGT** = actual ground time **ATD−ATA** (ATA and ATD full instants).
 *
 * **Cell [0][0]** (Before STA × \<GT): `ATA < STA` **and** `AGT < SGT`.
 * **Cell [0][1]** (Before STA × =GT): `ATA < STA` **and** `AGT === SGT` (same ms on parsed instants).
 * **Cell [1][0]** (On Time × \<GT): `ATA === STA` **and** `AGT < SGT`.
 * **Cell [1][1]** (On Time × =GT): `ATA === STA` **and** `ATD === STD` **and** `AGT === SGT` (ms on parsed instants).
 * **Cell [2][0]** (After STA × \<GT): `ATA > STA` **and** `AGT < SGT`.
 * **Cell [2][1]** (After STA × =GT): `ATA > STA` **and** `AGT === SGT`.
 * **Cell [0][2]** (Before STA × \>GT&<=STD): `ATA < STA` **and** `AGT > SGT` **and** `ATD <= STD`.
 * **Cell [0][3]** (Before STA × \>GT&>STD): `ATA < STA` **and** `AGT > SGT` **and** `ATD > STD`.
 * **Cell [1][3]** (On Time × \>GT&>STD): `ATA === STA` **and** `AGT > SGT` **and** `ATD > STD`.
 * **Cell [2][3]** (After STA × \>GT&>STD): `ATA > STA` **and** `AGT > SGT` **and** `ATD > STD`.
 */
export function computeOtpPerformanceMatrixPartialFromLegs(legs: PerformanceFlightFromDb[]): number[][] {
  const matrix: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (const f of legs) {
    if (f.isCancelled || isCancelledDbPerformanceFlight(f)) continue;

    const gt = getGroundTimes(f);
    if (!gt) continue;

    const { ata: ataMs, sta: staMs, atd: atdMs, std: stdMs, AGT: agtMs, SGT: sgtMs } = gt;

    if (ataMs < staMs && agtMs < sgtMs) {
      matrix[0]![0]! += 1;
    } else if (ataMs === staMs && agtMs < sgtMs) {
      matrix[1]![0]! += 1;
    } else if (ataMs > staMs && agtMs < sgtMs) {
      matrix[2]![0]! += 1;
    }

    if (ataMs < staMs && agtMs === sgtMs) {
      matrix[0]![1]! += 1;
    }

    if (ataMs === staMs && atdMs === stdMs && agtMs === sgtMs) {
      matrix[1]![1]! += 1;
    }

    if (ataMs > staMs && agtMs === sgtMs) {
      matrix[2]![1]! += 1;
    }

    if (matchesOtpBeforeStaGtLeStdCell(ataMs, staMs, atdMs, stdMs, agtMs, sgtMs)) {
      matrix[0]![2]! += 1;
    }

    if (ataMs < staMs && agtMs > sgtMs && atdMs > stdMs) {
      matrix[0]![3]! += 1;
    } else if (ataMs === staMs && agtMs > sgtMs && atdMs > stdMs) {
      matrix[1]![3]! += 1;
    } else if (matchesOtpGtGtStdCell(ataMs, staMs, atdMs, stdMs, agtMs, sgtMs)) {
      matrix[2]![3]! += 1;
    }
  }

  return matrix;
}

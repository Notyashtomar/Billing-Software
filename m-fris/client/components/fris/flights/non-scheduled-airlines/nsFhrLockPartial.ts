import type { NonScheduledFlightData } from './types';
import { resolveNonScheduledFlightStatus } from './adaptNonScheduledFlight';

/**
 * Derive Ramp / Pax / GSD lock columns from an `fhr_collection` /
 * `ns_fhr_collection` document (same rules as scheduled airlines).
 */
export function partialNsLocksFromFhrApiDoc(
  fhr: Record<string, unknown>,
): Partial<NonScheduledFlightData> {
  const fhrM =
    fhr.mainDetails != null &&
    typeof fhr.mainDetails === 'object' &&
    !Array.isArray(fhr.mainDetails);
  const fhrT =
    fhr.terminalDetails != null &&
    typeof fhr.terminalDetails === 'object' &&
    !Array.isArray(fhr.terminalDetails);
  const fhrR1 =
    fhr.rampDetails1 != null &&
    typeof fhr.rampDetails1 === 'object' &&
    !Array.isArray(fhr.rampDetails1);
  const fhrL =
    fhr.loadControlDetails != null &&
    typeof fhr.loadControlDetails === 'object' &&
    !Array.isArray(fhr.loadControlDetails);
  const eqE = fhr.equipmentManpower;
  let fhrG = false;
  if (eqE != null && typeof eqE === 'object' && !Array.isArray(eqE)) {
    const e = eqE as Record<string, unknown>;
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length > 0) fhrG = true;
    else {
      for (const k of [
        'verifiedBy',
        'verifiedAt',
        'verifiedByCode',
        'flightNo',
        'airlinesOperator',
        'sta',
        'staDate',
        'std',
        'stdDate',
        'acType',
        'routing',
        'operations',
      ]) {
        if (String(e[k] ?? '').trim()) {
          fhrG = true;
          break;
        }
      }
    }
  }
  return {
    hasMainDetails: fhrM,
    hasTerminalDetails: fhrT,
    hasRampDetails: fhrR1,
    hasLoadControlDetails: fhrL,
    hasEquipmentManpowerDetails: fhrG,
    rampLocked: fhrR1 ? 'Yes' : 'No',
    paxLocked: fhrT ? 'Yes' : 'No',
    gsdLocked: fhrG ? 'Yes' : 'No',
  };
}

export function applyNsLockPartial(
  flight: NonScheduledFlightData,
  partial: Partial<NonScheduledFlightData>,
): NonScheduledFlightData {
  const merged = { ...flight, ...partial };
  return {
    ...merged,
    flightStatus: resolveNonScheduledFlightStatus(merged),
  };
}

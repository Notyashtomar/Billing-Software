import { SHORT_SHIPPED_BAGS_SINGLETON_SERIAL } from '../constants/reports-pax-shift-report.constants';
import type {
  PaxShiftFlightSnapshot,
  PaxShiftShortShippedBagFlightEntry,
} from '../schema/reports-pax-shift-report.schema';
import {
  coerceOptionalInt,
  noOfBagsHasValue,
  normalizeNoOfBags,
} from './pax-shift-field-coercion.util';

export function normalizeFlightSnapshot(
  raw?: Record<string, string>,
): PaxShiftFlightSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const snap: PaxShiftFlightSnapshot = {
    airline: String(raw.airline ?? '').trim(),
    flightNo: String(raw.flightNo ?? '').trim(),
    aircraft: String(raw.aircraft ?? '').trim(),
    staDate: String(raw.staDate ?? '').trim(),
    staTime: String(raw.staTime ?? '').trim(),
    stdDate: String(raw.stdDate ?? '').trim(),
    stdTime: String(raw.stdTime ?? '').trim(),
  };
  const hasAny = Object.values(snap).some((v) => v !== '');
  return hasAny ? snap : undefined;
}

export function shortShippedBagsByFlightToObject(
  map:
    | Map<string, PaxShiftShortShippedBagFlightEntry>
    | Record<string, unknown>
    | undefined,
): Record<string, PaxShiftShortShippedBagFlightEntry> {
  const out: Record<string, PaxShiftShortShippedBagFlightEntry> = {};
  if (!map) return out;
  const entries =
    map instanceof Map
      ? Array.from(map.entries())
      : Object.entries(map as Record<string, unknown>);
  for (const [key, block] of entries) {
    const k = String(key ?? '').trim();
    if (!k || k === SHORT_SHIPPED_BAGS_SINGLETON_SERIAL) continue;
    if (!block || typeof block !== 'object') continue;
    out[k] = block as PaxShiftShortShippedBagFlightEntry;
  }
  return out;
}

export type LeanShortShippedFlightPayload = {
  flightSerial: string;
  noOfBags: number;
  rows: { id: string; optionSection: string; remarks: string }[];
  flightSnapshot?: {
    airline: string;
    flightNo: string;
    aircraft: string;
    staDate: string;
    staTime: string;
    stdDate: string;
    stdTime: string;
  };
};

export function leanShortShippedFlightEntry(
  flightSerial: string,
  entry: PaxShiftShortShippedBagFlightEntry | undefined,
): LeanShortShippedFlightPayload {
  const fs = String(flightSerial ?? '').trim();
  const bags = entry?.shortShippedBags;
  const snap = entry?.flightSnapshot;
  const rawBags = bags?.noOfBags;
  const noOfBags =
    typeof rawBags === 'number'
      ? coerceOptionalInt(rawBags) ?? 0
      : normalizeNoOfBags(rawBags) ?? 0;
  return {
    flightSerial: fs,
    noOfBags,
    rows: (bags?.rows ?? []).map((r) => ({
      id: String(r.id ?? '').trim(),
      optionSection: String(r.optionSection ?? '').trim(),
      remarks: String(r.remarks ?? '').trim(),
    })),
    flightSnapshot: snap
      ? {
          airline: String(snap.airline ?? '').trim(),
          flightNo: String(snap.flightNo ?? '').trim(),
          aircraft: String(snap.aircraft ?? '').trim(),
          staDate: String(snap.staDate ?? '').trim(),
          staTime: String(snap.staTime ?? '').trim(),
          stdDate: String(snap.stdDate ?? '').trim(),
          stdTime: String(snap.stdTime ?? '').trim(),
        }
      : undefined,
  };
}

/** Read bags from a legacy per-flight document (pre-singleton migration). */
export function leanShortShippedFromLegacyDoc(doc: {
  flightSerial?: string;
  shortShippedBags?: PaxShiftShortShippedBagFlightEntry['shortShippedBags'];
  flightSnapshot?: PaxShiftFlightSnapshot;
}): LeanShortShippedFlightPayload {
  const fs = String(doc.flightSerial ?? '').trim();
  return leanShortShippedFlightEntry(fs, {
    shortShippedBags: doc.shortShippedBags ?? { rows: [] },
    flightSnapshot: doc.flightSnapshot,
  });
}

export function isShortShippedSingletonSerial(flightSerial: string): boolean {
  return String(flightSerial ?? '').trim() === SHORT_SHIPPED_BAGS_SINGLETON_SERIAL;
}

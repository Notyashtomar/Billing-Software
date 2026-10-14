import { FORM_PATHS, fetchNsRawFormData } from '@/lib/api';
import type { FlightData } from '@/utils/dataProcessor';

export type MissingFhrSidebarView =
  | 'main-details'
  | 'terminal-details'
  | 'load-control-details'
  | 'ramp-details'
  | 'equipment-manpower';

export type LockKind = 'ramp' | 'pax' | 'gsd';

export type FormPresenceFlags = {
  hasMainDetails: boolean;
  hasTerminalDetails: boolean;
  hasRampDetails: boolean;
  hasLoadControlDetails: boolean;
  hasEquipmentManpowerDetails: boolean;
  rampLocked: boolean;
  paxLocked: boolean;
  gsdLocked: boolean;
};

export type PendingFormLink = {
  id: MissingFhrSidebarView;
  label: string;
};

const EMPTY_PRESENCE: FormPresenceFlags = {
  hasMainDetails: false,
  hasTerminalDetails: false,
  hasRampDetails: false,
  hasLoadControlDetails: false,
  hasEquipmentManpowerDetails: false,
  rampLocked: false,
  paxLocked: false,
  gsdLocked: false,
};

/** Lock + form-presence flags from `GET /fhr-collection/flight/:serial`. */
export function formPresenceFromFhrDoc(
  fhr: Record<string, unknown> | null | undefined,
): FormPresenceFlags {
  if (!fhr) return { ...EMPTY_PRESENCE };

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
    rampLocked: fhrR1,
    paxLocked: fhrT,
    gsdLocked: fhrG,
  };
}

export function formPresenceFromFlightRow(
  flight: Pick<
    FlightData,
    | 'hasMainDetails'
    | 'hasTerminalDetails'
    | 'hasRampDetails'
    | 'hasLoadControlDetails'
    | 'hasEquipmentManpowerDetails'
    | 'rampLocked'
    | 'paxLocked'
    | 'gsdLocked'
  >,
): FormPresenceFlags {
  const rampLocked = isLockedValue(flight.rampLocked);
  const paxLocked = isLockedValue(flight.paxLocked);
  const gsdLocked = isLockedValue(flight.gsdLocked);
  return {
    hasMainDetails: Boolean(flight.hasMainDetails),
    hasTerminalDetails: Boolean(flight.hasTerminalDetails),
    hasRampDetails: Boolean(flight.hasRampDetails),
    hasLoadControlDetails: Boolean(flight.hasLoadControlDetails),
    hasEquipmentManpowerDetails: Boolean(flight.hasEquipmentManpowerDetails),
    rampLocked,
    paxLocked,
    gsdLocked,
  };
}

function isLockedValue(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
}

const LOCK_PENDING_FORMS: Record<
  LockKind,
  Array<{ id: MissingFhrSidebarView; label: string; isComplete: (p: FormPresenceFlags) => boolean }>
> = {
  ramp: [
    {
      id: 'ramp-details',
      label: 'Ramp details',
      isComplete: (p) => p.hasRampDetails,
    },
  ],
  pax: [
    {
      id: 'terminal-details',
      label: 'Terminal details',
      isComplete: (p) => p.hasTerminalDetails,
    },
  ],
  gsd: [
    {
      id: 'equipment-manpower',
      label: 'Equipment / Manpower',
      isComplete: (p) => p.hasEquipmentManpowerDetails,
    },
  ],
};

export function pendingFormsForLock(
  lockKind: LockKind,
  presence: FormPresenceFlags,
): PendingFormLink[] {
  return LOCK_PENDING_FORMS[lockKind]
    .filter((form) => !form.isComplete(presence))
    .map(({ id, label }) => ({ id, label }));
}

export function lockIsOpen(lockKind: LockKind, presence: FormPresenceFlags): boolean {
  if (lockKind === 'ramp') return !presence.rampLocked;
  if (lockKind === 'pax') return !presence.paxLocked;
  return !presence.gsdLocked;
}

export function flightStillMissingFhr(presence: FormPresenceFlags): boolean {
  return !presence.rampLocked || !presence.paxLocked || !presence.gsdLocked;
}

export function isAllowedMissingFhrSidebarView(
  value: string | null | undefined,
): value is MissingFhrSidebarView {
  return (
    value === 'main-details' ||
    value === 'terminal-details' ||
    value === 'load-control-details' ||
    value === 'ramp-details' ||
    value === 'equipment-manpower'
  );
}

function nsDocPresent(doc: unknown): boolean {
  return doc != null && typeof doc === 'object' && !Array.isArray(doc);
}

/** Lock + form-presence flags from non-scheduled ns-raw form documents. */
export function formPresenceFromNsRawDocs(opts: {
  terminal?: unknown;
  ramp?: unknown;
  equipment?: unknown;
  main?: unknown;
  loadControl?: unknown;
}): FormPresenceFlags {
  const hasTerminalDetails = nsDocPresent(opts.terminal);
  const hasRampDetails = nsDocPresent(opts.ramp);
  let hasEquipmentManpowerDetails = false;
  if (nsDocPresent(opts.equipment)) {
    const e = opts.equipment as Record<string, unknown>;
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length > 0) {
      hasEquipmentManpowerDetails = true;
    } else {
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
          hasEquipmentManpowerDetails = true;
          break;
        }
      }
    }
  }
  return {
    hasMainDetails: nsDocPresent(opts.main),
    hasTerminalDetails,
    hasRampDetails,
    hasLoadControlDetails: nsDocPresent(opts.loadControl),
    hasEquipmentManpowerDetails,
    rampLocked: hasRampDetails,
    paxLocked: hasTerminalDetails,
    gsdLocked: hasEquipmentManpowerDetails,
  };
}

/** Probe ns-raw forms used for Missing FHR ramp / pax / GSD locks. */
export async function fetchNsFormPresence(serial: string): Promise<FormPresenceFlags> {
  const key = String(serial ?? '').trim();
  if (!key) return { ...EMPTY_PRESENCE };
  const [terminal, ramp, equipment] = await Promise.all([
    fetchNsRawFormData(FORM_PATHS.terminalDetails, key),
    fetchNsRawFormData(FORM_PATHS.rampDetails1, key),
    fetchNsRawFormData(FORM_PATHS.equipmentManpower, key),
  ]);
  return formPresenceFromNsRawDocs({ terminal, ramp, equipment });
}

/** Bounded concurrency for Missing FHR date-range loads. */
export async function fetchNsFormPresenceMap(
  serials: string[],
  concurrency = 6,
): Promise<Map<string, FormPresenceFlags>> {
  const unique = Array.from(
    new Set(serials.map((s) => String(s ?? '').trim()).filter(Boolean)),
  );
  const out = new Map<string, FormPresenceFlags>();
  if (unique.length === 0) return out;

  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (index < unique.length) {
      const current = unique[index++]!;
      out.set(current, await fetchNsFormPresence(current));
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Explicit flight scenario stored on the preparation snapshot.
 *
 * Why: diverted / return-to-ramp / technical / standby used to be detected by
 * regex over free text (type of handling, remarks, …) at invoice time. A typo
 * or a renamed label silently changed the invoice. The scenario is now
 * classified once at preparation time and stored as `flightScenario`; the
 * engine reads that field first and falls back to text only for records that
 * predate the field.
 */

export const FLIGHT_SCENARIOS = [
  'normal',
  'diverted',
  'returnToRamp',
  'technical',
  'standby',
] as const;

export type FlightScenario = (typeof FLIGHT_SCENARIOS)[number];

export const FLIGHT_SCENARIO_FIELD = 'flightScenario';

const SCENARIO_SET = new Set<string>(FLIGHT_SCENARIOS);

/** Stored scenario when the record carries a recognised value, otherwise null. */
export function readStoredFlightScenario(
  ...sources: Array<Record<string, unknown> | null | undefined>
): FlightScenario | null {
  for (const source of sources) {
    const raw = source?.[FLIGHT_SCENARIO_FIELD];
    if (raw == null) continue;
    const text = String(raw).trim();
    if (!text) continue;
    if (SCENARIO_SET.has(text)) return text as FlightScenario;
    // Accept common label spellings saved from the UI.
    const compact = text.toLowerCase().replace(/[\s_-]+/g, '');
    if (compact === 'returntoramp' || compact === 'rtr') return 'returnToRamp';
    if (compact === 'technicallanding' || compact === 'tech') return 'technical';
    if (compact === 'standby') return 'standby';
    if (compact === 'diverted' || compact === 'diversion') return 'diverted';
    if (compact === 'normal' || compact === 'none') return 'normal';
  }
  return null;
}

export type FlightScenarioTextParts = {
  /** Lower-cased concatenation of every handling / category / remarks field. */
  allText: string;
  /** Lower-cased FHR handling corpus (type of handling, ops, flight type …). */
  handlingCorpus: string;
  /** Lower-cased category of flight. */
  categoryLower: string;
  /** Raw snapshot for boolean flags such as `returnToRamp`. */
  snap: Record<string, unknown>;
};

export function isDivertedText(parts: Pick<FlightScenarioTextParts, 'allText'>): boolean {
  return /\bdivert/.test(parts.allText) || /\bdiversion\b/.test(parts.allText);
}

export function isReturnToRampText(
  parts: Pick<FlightScenarioTextParts, 'allText' | 'snap'>,
): boolean {
  return (
    Boolean(parts.snap.returnToRamp) ||
    Boolean(parts.snap.return_to_ramp) ||
    /\breturn to ramp\b/.test(parts.allText) ||
    /\brtr\b/.test(parts.allText)
  );
}

export function isTechnicalText(
  parts: Pick<FlightScenarioTextParts, 'handlingCorpus' | 'categoryLower'>,
): boolean {
  return (
    /technical/.test(parts.handlingCorpus) ||
    /\btech\b/.test(parts.handlingCorpus) ||
    /technical/.test(parts.categoryLower)
  );
}

export function isStandbyText(
  parts: Pick<FlightScenarioTextParts, 'handlingCorpus' | 'categoryLower'>,
): boolean {
  return (
    /stand[\s-]?by/.test(parts.handlingCorpus) || /stand[\s-]?by/.test(parts.categoryLower)
  );
}

/**
 * Classify from text only (never from a previously stored value). Precedence
 * mirrors the invoice engine: diverted → return to ramp → technical → standby.
 */
export function classifyFlightScenarioFromText(parts: FlightScenarioTextParts): FlightScenario {
  if (isDivertedText(parts)) return 'diverted';
  if (isReturnToRampText(parts)) return 'returnToRamp';
  if (isTechnicalText(parts)) return 'technical';
  if (isStandbyText(parts)) return 'standby';
  return 'normal';
}

export function flightScenarioLabel(scenario: FlightScenario | null | undefined): string {
  switch (scenario) {
    case 'diverted':
      return 'Diverted';
    case 'returnToRamp':
      return 'Return to ramp';
    case 'technical':
      return 'Technical landing';
    case 'standby':
      return 'Standby';
    case 'normal':
      return 'Normal';
    default:
      return '';
  }
}

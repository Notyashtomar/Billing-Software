export type ScheduledCategoryMix = {
  SIP: number;
  SIF: number;
  SDP: number;
  SDF: number;
  'SCH-I-P-NB'?: number;
  'SCH-I-P-WB'?: number;
  'SCH-D-P-NB'?: number;
  'SCH-D-P-WB'?: number;
  'SCH-I-F-NB'?: number;
  'SCH-I-F-WB'?: number;
  'SCH-D-F-NB'?: number;
  'SCH-D-F-WB'?: number;
  other: number;
  total: number;
};

export type AircraftCategoryMixResponse = {
  scheduled: ScheduledCategoryMix;
  additional: ScheduledCategoryMix;
};

const EMPTY_SCHEDULED_CATEGORY_MIX: ScheduledCategoryMix = {
  SIP: 0,
  SIF: 0,
  SDP: 0,
  SDF: 0,
  other: 0,
  total: 0,
};

/** Supports nested `{ scheduled, additional }` or legacy flat `ScheduledCategoryMix`. */
export function parseAircraftCategoryMixResponse(
  json: unknown,
): AircraftCategoryMixResponse | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (
    'scheduled' in o &&
    'additional' in o &&
    o.scheduled &&
    o.additional &&
    typeof o.scheduled === 'object' &&
    typeof o.additional === 'object'
  ) {
    return json as AircraftCategoryMixResponse;
  }
  if ('total' in o && typeof o.total === 'number' && 'SIP' in o) {
    return {
      scheduled: json as ScheduledCategoryMix,
      additional: { ...EMPTY_SCHEDULED_CATEGORY_MIX },
    };
  }
  return null;
}

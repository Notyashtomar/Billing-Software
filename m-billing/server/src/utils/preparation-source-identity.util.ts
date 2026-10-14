export type PreparationSourceLike = {
  sourceRef?: {
    serialNo?: string;
    usageRowId?: string;
  };
  operationalData?: Record<string, unknown>;
  operationalSnapshot?: Record<string, unknown>;
};

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim();
}

function toYmd(value: unknown): string {
  const s = normalizeToken(value);
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
  }
  return '';
}

function movementDateYmd(input: PreparationSourceLike): string {
  const op = input.operationalSnapshot ?? input.operationalData ?? {};
  return (
    toYmd(op.atdDate) ||
    toYmd(op.ATDDate) ||
    toYmd(op.staDate) ||
    toYmd(op.STADate) ||
    toYmd(op.stdDate) ||
    toYmd(op.STDDate)
  );
}

function movementTime(input: PreparationSourceLike): string {
  const op = input.operationalSnapshot ?? input.operationalData ?? {};
  return normalizeToken(op.atdTime) || normalizeToken(op.ATDTime) || normalizeToken(op.staTime);
}

function movementFlightNo(input: PreparationSourceLike): string {
  const op = input.operationalSnapshot ?? input.operationalData ?? {};
  return normalizeToken(op.flightNoEquipmentNo) || normalizeToken(op.flightNo) || normalizeToken(op['Flight No']);
}

function isReturnToRamp(input: PreparationSourceLike): boolean {
  const op = input.operationalSnapshot ?? input.operationalData ?? {};
  const haystack = [
    op.turnaroundStatus,
    op.turnaround_status,
    op.TurnaroundStatus,
    op.ops,
    op.opsType,
    op.typeOfFlight,
    op.Typeofflight,
    op.categoryOfFlight,
  ]
    .map((v) => normalizeToken(v).toUpperCase())
    .filter(Boolean)
    .join(' ');
  return haystack.includes('RTR') || haystack.includes('RETURN TO RAMP');
}

function serialFrom(input: PreparationSourceLike): string {
  return normalizeToken(
    input.sourceRef?.serialNo ??
      input.operationalSnapshot?.serialNumber ??
      input.operationalData?.serialNumber,
  );
}

/** Identity for preparation ingest / sent marking — serial number only. */
export function preparationSourceIdentity(input: PreparationSourceLike): string {
  const usage = normalizeToken(input.sourceRef?.usageRowId);
  if (usage) return `usage:${usage}`;
  const serial = serialFrom(input);
  if (!serial) return '';
  const movementDate = movementDateYmd(input);
  if (isReturnToRamp(input)) {
    const flightNo = movementFlightNo(input);
    const time = movementTime(input);
    return `serial:${serial}|date:${movementDate || 'unknown'}|rtr:${flightNo || 'na'}:${time || 'na'}`;
  }
  if (movementDate) return `serial:${serial}|date:${movementDate}`;
  return `serial:${serial}`;
}

export function preparationIdentitiesMatch(
  ingest: PreparationSourceLike,
  existing: PreparationSourceLike,
): boolean {
  const idA = preparationSourceIdentity(ingest);
  const idB = preparationSourceIdentity(existing);
  return Boolean(idA) && idA === idB;
}

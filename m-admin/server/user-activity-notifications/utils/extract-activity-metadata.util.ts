type ReqLike = {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

const META_KEYS = [
  'stationId',
  'fhrNo',
  'serialNo',
  'flightId',
  'ticketNumber',
  'userId',
  'employeeId',
] as const;

function pickString(value: unknown): string | undefined {
  const s = String(value ?? '').trim();
  return s || undefined;
}

export function extractActivityMetadata(req: ReqLike): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  const sources = [req.params, req.query, req.body];

  for (const key of META_KEYS) {
    for (const source of sources) {
      if (!source || !(key in source)) continue;
      const value = pickString(source[key]);
      if (value) {
        meta[key] = value;
        break;
      }
    }
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

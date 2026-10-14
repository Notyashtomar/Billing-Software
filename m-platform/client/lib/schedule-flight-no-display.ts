/**
 * Scheduled Airlines / Schedule Setup flight-number display rules.
 * Shared by client dataProcessor + Scheduled Airlines UI.
 */

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const t = String(v).trim();
    if (t) return t;
  }
  return '';
}

export function normalizeScheduleFlightNoToken(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/[^A-Z0-9/]/g, '');
}

export function isScheduleOperationSplit(data: Record<string, unknown>): boolean {
  if (data.ifOperationSplit === true) return true;
  const raw = firstNonEmpty(
    data['Operation Split'],
    data.ifOperationSplit,
    data.IsSplit,
  ).toLowerCase();
  return raw === 'yes' || raw === 'true' || raw === '1';
}

/** Prefix leg with airline code when missing (IX + 1089 → IX1089). */
export function withAirlineCodePrefix(airlineCode: string, leg: string): string {
  const code = String(airlineCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const raw = normalizeScheduleFlightNoToken(leg);
  if (!raw) return '';
  if (!code) return raw;
  if (raw.startsWith(code)) return raw;
  return `${code}${raw}`;
}

/** Remove duplicated half when e.g. `SG674/660/SG674/660` → `SG674/660`. */
export function dedupeRepeatedFlightNoSegments(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t.includes('/')) return t;
  const parts = t.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return t;
  if (parts.every((p) => p.toUpperCase() === parts[0]!.toUpperCase())) {
    return parts[0]!;
  }
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const first = parts.slice(0, half);
    const second = parts.slice(half);
    if (first.every((p, i) => p.toUpperCase() === (second[i] ?? '').toUpperCase())) {
      return first.join('/');
    }
  }
  return t;
}

/**
 * - Non-split → Schedule Setup `flightNo` as entered
 * - Split → `airlineCode+arrival/airlineCode+departure`
 */
/** Excel cancelled numbers keep every character except spaces (`CANC -FD 196/197` → `CANC-FD196/197`). */
function cancelledFlightNoAsStored(data: Record<string, unknown>): string {
  const compact = firstNonEmpty(data.flightNo, data['Flight No'], data.FlightNo).replace(
    /\s+/g,
    '',
  );
  return /^CANC/i.test(compact) ? compact : '';
}

export function displayFlightNoFromScheduleData(
  data: Record<string, unknown>,
): string {
  const storedCancelled = cancelledFlightNoAsStored(data);
  if (storedCancelled) return storedCancelled;

  const airlineCode = firstNonEmpty(
    data.airlineCode,
    data['Airline Code'],
    data.Arline_Code,
  );
  const stored = normalizeScheduleFlightNoToken(
    firstNonEmpty(data.flightNo, data['Flight No'], data.FlightNo),
  );
  const arr = normalizeScheduleFlightNoToken(
    firstNonEmpty(
      data.arrivalFlightNo,
      data['Arrival Flight No'],
      data.ArrivalFltNo,
      data.arrivalFltNo,
      data['Arrival Flt No'],
    ),
  );
  const dep = normalizeScheduleFlightNoToken(
    firstNonEmpty(
      data.departureFlightNo,
      data['Departure Flight No'],
      data.DepartureFltNo,
      data.departureFltNo,
      data['Departure Flt No'],
    ),
  );

  if (isScheduleOperationSplit(data)) {
    const a = withAirlineCodePrefix(airlineCode, arr);
    const d = withAirlineCodePrefix(airlineCode, dep);
    if (a && d) {
      return dedupeRepeatedFlightNoSegments(
        a.toUpperCase() === d.toUpperCase() ? a : `${a}/${d}`,
      );
    }
    return dedupeRepeatedFlightNoSegments(a || d || stored);
  }

  if (stored) return dedupeRepeatedFlightNoSegments(stored);
  if (arr && dep) {
    const a = withAirlineCodePrefix(airlineCode, arr);
    const d = withAirlineCodePrefix(airlineCode, dep);
    if (a && d) {
      return dedupeRepeatedFlightNoSegments(
        a.toUpperCase() === d.toUpperCase() ? a : `${a}/${d}`,
      );
    }
  }
  return dedupeRepeatedFlightNoSegments(
    withAirlineCodePrefix(airlineCode, arr || dep),
  );
}

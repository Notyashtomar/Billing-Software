/** Remove duplicated half when e.g. `SG674/660/SG674/660` → `SG674/660`; `EK-1087/EK-1087` → `EK-1087`. */
export function dedupeRepeatedFlightNoSegments(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t.includes('/')) return t;
  const parts = t
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return t;
  if (parts.every((p) => p.toUpperCase() === parts[0]!.toUpperCase())) {
    return parts[0]!;
  }
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const first = parts.slice(0, half);
    const second = parts.slice(half);
    if (
      first.every(
        (p, i) => p.toUpperCase() === (second[i] ?? '').toUpperCase(),
      )
    ) {
      return first.join('/');
    }
  }
  return t;
}

/**
 * Build a single flight-number label from arrival / departure legs.
 * Handles equal legs, pre-combined values, and duplicated segments.
 */
export function flightNoFromArrivalDeparture(
  arrivalRaw: unknown,
  departureRaw: unknown,
): string {
  const a = String(arrivalRaw ?? '').trim();
  const d = String(departureRaw ?? '').trim();
  if (!a && !d) return '';
  if (a && d) {
    if (a.toUpperCase() === d.toUpperCase()) {
      return dedupeRepeatedFlightNoSegments(a);
    }
    if (a.includes('/')) {
      const lastLeg = a.split('/').pop()?.trim() ?? '';
      if (
        a.toUpperCase().includes(d.toUpperCase()) ||
        (lastLeg && lastLeg.toUpperCase() === d.toUpperCase())
      ) {
        return dedupeRepeatedFlightNoSegments(a);
      }
    }
    if (d.includes('/')) {
      const firstLeg = d.split('/')[0]?.trim() ?? '';
      if (
        d.toUpperCase().includes(a.toUpperCase()) ||
        (firstLeg && firstLeg.toUpperCase() === a.toUpperCase())
      ) {
        return dedupeRepeatedFlightNoSegments(d);
      }
    }
    return dedupeRepeatedFlightNoSegments(`${a}/${d}`);
  }
  return dedupeRepeatedFlightNoSegments(a || d);
}

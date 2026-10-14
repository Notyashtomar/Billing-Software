import { airportCityName } from './station-logo.util';

export type RouteSector = {
  code: string;
  city: string;
};

/** Split `DMK-MAA-DMK` / `DEL-BOM` into IATA tokens (hyphen without spaces). */
function splitHyphenatedIataChain(raw: string): string[] {
  const compact = String(raw ?? '').trim();
  if (!compact) return [];
  if (!/^[A-Za-z]{3}(?:-[A-Za-z]{3})+$/.test(compact)) return [];
  return compact.split('-').map((p) => p.trim().toUpperCase()).filter(Boolean);
}

/** Parse route strings (DEL-BOM, DMK-MAA-DMK, DEL → BOM → DEL, DEL (Delhi) - BOM). */
export function parseRouteSectors(route: string): RouteSector[] {
  const raw = String(route ?? '').trim();
  if (!raw) return [];

  const hyphenParts = splitHyphenatedIataChain(raw);
  const parts =
    hyphenParts.length > 0
      ? hyphenParts
      : raw
          .split(/\s*(?:→|->|—|–|\/|\||\s+-\s+|-)\s*/g)
          .map((p) => p.trim())
          .filter(Boolean);

  const sectors: RouteSector[] = [];
  for (const part of parts) {
    const paren = /^([A-Za-z]{3,4})\s*\(([^)]+)\)$/i.exec(part);
    if (paren) {
      sectors.push({
        code: paren[1].toUpperCase(),
        city: paren[2].trim(),
      });
      continue;
    }
    const codeOnly = /^[A-Za-z]{3,4}$/.exec(part);
    if (codeOnly) {
      const code = part.toUpperCase();
      sectors.push({
        code,
        city: airportCityName(code),
      });
      continue;
    }
    const embedded = /\b([A-Za-z]{3,4})\b/.exec(part);
    if (embedded) {
      const code = embedded[1].toUpperCase();
      sectors.push({
        code,
        city: airportCityName(code),
      });
    }
  }

  const deduped: RouteSector[] = [];
  for (const s of sectors) {
    if (!s.code) continue;
    deduped.push({
      code: s.code,
      city: s.city || airportCityName(s.code),
    });
  }
  return deduped;
}

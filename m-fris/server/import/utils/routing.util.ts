import { IATA_CODE_REGEX } from '../constants/flight-import.constants';

export function parseRoutingAirports(routing: string): string[] {
  const raw = String(routing ?? '').trim().toUpperCase();
  const match = /^([A-Z]{3})-([A-Z]{3})$/.exec(raw);
  if (!match) return [];
  return [match[1], match[2]];
}

export function isValidIataToken(code: string): boolean {
  return IATA_CODE_REGEX.test(String(code ?? '').trim().toUpperCase());
}

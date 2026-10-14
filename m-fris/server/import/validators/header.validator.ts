import {
  HEADER_ALIASES,
  IMPORT_ERROR_TYPES,
  REQUIRED_HEADERS,
} from '../constants/flight-import.constants';
import type { HeaderValidationErrorPayload } from '../utils/import-error-collector';

export interface HeaderValidationResult {
  valid: boolean;
  canonicalHeaders: string[];
  headerIndexByCanonical: Map<string, number>;
  error?: HeaderValidationErrorPayload;
}

function normalizeHeaderToken(header: string): string {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function validateExcelHeaders(rawHeaders: string[]): HeaderValidationResult {
  const canonicalHeaders: string[] = [];
  const headerIndexByCanonical = new Map<string, number>();
  const seenCanonical = new Map<string, number>();
  const duplicateHeaders: string[] = [];
  const presentCanonical = new Set<string>();

  for (let i = 0; i < rawHeaders.length; i++) {
    const token = normalizeHeaderToken(rawHeaders[i]);
    if (!token) continue;

    const canonical = HEADER_ALIASES[token];
    if (!canonical) continue;

    if (seenCanonical.has(canonical)) {
      if (!duplicateHeaders.includes(canonical)) {
        duplicateHeaders.push(canonical);
      }
      continue;
    }

    seenCanonical.set(canonical, i);
    canonicalHeaders.push(canonical);
    headerIndexByCanonical.set(canonical, i);
    presentCanonical.add(canonical);
  }

  const missingHeaders = REQUIRED_HEADERS.filter((h) => !presentCanonical.has(h));

  if (missingHeaders.length > 0 || duplicateHeaders.length > 0) {
    return {
      valid: false,
      canonicalHeaders,
      headerIndexByCanonical,
      error: {
        type: IMPORT_ERROR_TYPES.HEADER_VALIDATION_FAILED,
        missingHeaders: [...missingHeaders],
        duplicateHeaders: [...duplicateHeaders],
        message: 'Excel header validation failed',
      },
    };
  }

  return {
    valid: true,
    canonicalHeaders: [...REQUIRED_HEADERS],
    headerIndexByCanonical,
  };
}

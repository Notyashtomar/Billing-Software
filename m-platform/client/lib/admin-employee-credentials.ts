/**
 * Auto-generated employee ID and company email for admin add-user flow.
 */

const ISSUED_IDS_KEY = 'fris_admin_issued_employee_ids';

/** Company dropdown value → email domain rule (must match registry names). */
export const COMPANY_EMAIL_RULES: Record<
  string,
  { kind: 'fixed'; host: string } | { kind: 'bas_station' }
> = {
  'Bird Flight Services (India) Pvt. Ltd.': { kind: 'fixed', host: 'bird.in' },
  'GlobeGround India Pvt. Ltd.': { kind: 'fixed', host: 'ggi.in' },
  'GSEC Bird Airport Services Pvt. Ltd.': { kind: 'fixed', host: 'gsec.in' },
};

export function parseStationCodeFromLabel(stationLabel: string): string {
  const head = stationLabel.split(/\s*[—–-]\s*/)[0]?.trim() ?? '';
  return head.toUpperCase();
}

/** First three letters of station code (A–Z only), padded with X if needed. */
export function stationPrefixThreeLetters(stationCode: string): string {
  const letters = stationCode.replace(/[^A-Za-z]/g, '').toUpperCase();
  const core = (letters.slice(0, 3) + 'XXX').slice(0, 3);
  return core;
}

function employeeIdInitial(firstName: string): string {
  const t = firstName.trim();
  if (!t) return 'X';
  const ch = t[0]!.toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : 'X';
}

function isIssuedIdFormat(id: string): boolean {
  return /^[A-Z]{4}\d{4}$/.test(id);
}

export function getIssuedEmployeeIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ISSUED_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function rememberIssuedEmployeeId(id: string): void {
  if (typeof window === 'undefined' || !isIssuedIdFormat(id)) return;
  const set = getIssuedEmployeeIds();
  if (set.has(id)) return;
  set.add(id);
  localStorage.setItem(ISSUED_IDS_KEY, JSON.stringify([...set]));
}

/**
 * First free 8-character ID: 3 (station) + 1 (initial) + 4 digits, unique in storage.
 */
export function proposeEmployeeId(stationLabel: string, firstName: string): string {
  const code = parseStationCodeFromLabel(stationLabel);
  const prefix3 = stationPrefixThreeLetters(code);
  const initial = employeeIdInitial(firstName);
  const prefix4 = `${prefix3}${initial}`;
  const used = getIssuedEmployeeIds();

  for (let n = 0; n < 10000; n++) {
    const suffix = n.toString().padStart(4, '0');
    const id = `${prefix4}${suffix}`;
    if (!used.has(id)) return id;
  }

  for (let k = 0; k < 500; k++) {
    const suffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const id = `${prefix4}${suffix}`;
    if (!used.has(id)) return id;
  }

  return `${prefix4}9999`;
}

function sanitizeNamePart(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '';

  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (normalized) return normalized;

  const fallback = trimmed.toLowerCase().replace(/\s+/g, '');
  return fallback.replace(/[^a-z0-9]/g, '');
}

function splitEmailLocalPart(
  cleaned: string,
): { localFirst: string; localLast: string } | null {
  const separator = cleaned.includes('.') ? '.' : cleaned.includes('_') ? '_' : null;
  if (separator) {
    const [first, ...rest] = cleaned.split(separator);
    const derivedFirst = first.replace(/[^a-z0-9]/g, '');
    const derivedLast = rest.join('').replace(/[^a-z0-9]/g, '');
    if (derivedFirst && derivedLast) {
      return { localFirst: derivedFirst, localLast: derivedLast };
    }
  }

  const token = cleaned.replace(/[^a-z0-9]/g, '');
  if (token.length >= 4) {
    const splitAt = Math.max(2, Math.ceil(token.length / 2));
    return {
      localFirst: token.slice(0, splitAt),
      localLast: token.slice(splitAt) || 'user',
    };
  }

  return null;
}

function deriveEmailLocalParts(
  firstName: string,
  lastName: string,
  personalEmail?: string,
): { localFirst: string; localLast: string } | null {
  const localFirst = sanitizeNamePart(firstName);
  const localLast = sanitizeNamePart(lastName);
  if (localFirst && localLast) {
    return { localFirst, localLast };
  }

  const emailLocal = personalEmail?.split('@')[0]?.trim().toLowerCase() ?? '';
  const cleaned = emailLocal.replace(/[^a-z0-9._-]/g, '');
  const fromEmail = splitEmailLocalPart(cleaned);
  if (fromEmail) return fromEmail;

  const mergedFirst = (localFirst || cleaned.replace(/[^a-z0-9]/g, '')).trim();
  const mergedLast = (localLast || 'user').replace(/[^a-z0-9]/g, '') || 'user';
  if (mergedFirst) {
    return { localFirst: mergedFirst, localLast: mergedLast };
  }

  return null;
}

function inferCompanyEmailRule(
  company: string,
): (typeof COMPANY_EMAIL_RULES)[string] | null {
  const normalized = company.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('gsec')) {
    return { kind: 'fixed', host: 'gsec.in' };
  }
  if (normalized.includes('globeground') || /\bggi\b/.test(normalized)) {
    return { kind: 'fixed', host: 'ggi.in' };
  }
  if (
    normalized.includes('bfs') ||
    (normalized.includes('bird') && normalized.includes('flight'))
  ) {
    return { kind: 'fixed', host: 'bird.in' };
  }
  if (normalized.includes('bird') && normalized.includes('airport')) {
    return { kind: 'bas_station' };
  }
  if (/\bbas\b/.test(normalized)) {
    return { kind: 'bas_station' };
  }

  return null;
}

export function resolveCompanyEmailRule(
  company: string,
): (typeof COMPANY_EMAIL_RULES)[string] | null {
  const trimmed = company.trim();
  if (!trimmed) return null;

  if (COMPANY_EMAIL_RULES[trimmed]) {
    return COMPANY_EMAIL_RULES[trimmed];
  }

  const inferred = inferCompanyEmailRule(trimmed);
  if (inferred) return inferred;

  const normalized = trimmed.toLowerCase();
  const matchedKey = Object.keys(COMPANY_EMAIL_RULES).find((key) => {
    const candidate = key.trim().toLowerCase();
    return (
      candidate === normalized ||
      candidate.includes(normalized) ||
      normalized.includes(candidate)
    );
  });
  return matchedKey ? COMPANY_EMAIL_RULES[matchedKey] : null;
}

export function getCompanyEmailGenerationHint(
  firstName: string,
  lastName: string,
  company: string,
  stationLabel: string,
  personalEmail?: string,
): string | null {
  if (!firstName.trim()) {
    return 'Enter first name on step 1.';
  }
  if (!company.trim()) {
    return 'Select a company on step 1.';
  }

  const rule = resolveCompanyEmailRule(company);
  if (!rule) {
    return 'The selected company does not have a configured email domain.';
  }
  if (rule.kind === 'bas_station' && !stationLabel.trim()) {
    return 'Select a station on step 1 for Bird airport Services email generation.';
  }

  if (!deriveEmailLocalParts(firstName, lastName, personalEmail)) {
    return 'Use letters in the name fields, or a personal email like first.last@example.com on step 1.';
  }

  return null;
}

export function buildCompanyEmail(
  firstName: string,
  lastName: string,
  company: string,
  stationLabel: string,
  personalEmail?: string,
): string | null {
  const rule = resolveCompanyEmailRule(company);
  if (!rule) return null;

  const localParts = deriveEmailLocalParts(firstName, lastName, personalEmail);
  if (!localParts) return null;

  const local = `${localParts.localFirst}.${localParts.localLast}`;

  if (rule.kind === 'fixed') {
    return `${local}@${rule.host}`;
  }

  if (!stationLabel.trim()) return null;

  const stationCode = parseStationCodeFromLabel(stationLabel);
  const sub = `bas${stationCode.toLowerCase()}`;
  return `${local}@${sub}.in`;
}

export function generateEmployeeId(input: {
  firstName: string;
  station: string;
}): string {
  return proposeEmployeeId(input.station, input.firstName);
}

export function generateEmployeeCredentials(input: {
  firstName: string;
  lastName: string;
  company: string;
  station: string;
  personalEmail?: string;
}): {
  employeeId: string;
  companyEmail: string;
  hint: string | null;
} {
  const employeeId = proposeEmployeeId(input.station, input.firstName);
  const companyEmail =
    buildCompanyEmail(
      input.firstName,
      input.lastName,
      input.company,
      input.station,
      input.personalEmail,
    ) ?? '';
  const hint = companyEmail
    ? null
    : getCompanyEmailGenerationHint(
        input.firstName,
        input.lastName,
        input.company,
        input.station,
        input.personalEmail,
      );

  return { employeeId, companyEmail, hint };
}

/** Strong random login password for new panel users (12+ chars, mixed character classes). */
export function generateEmployeePassword(length = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;
  const pick = (set: string) => set.charAt(Math.floor(Math.random() * set.length));
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest = Array.from({ length: Math.max(0, length - 4) }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
}

/**
 * Daily Flight Override helpers for Creation → Schedule Airlines.
 *
 * Business rule: overrides apply to one generated operating day only.
 * Master schedule (`advance_schedule_setup`) is never mutated from this path.
 */

/** Build stable document key for a day-specific override. */
export function buildDailyOverrideSerialKey(input: {
  instanceSerial?: string;
  scheduleMasterSerial: string;
  operationDateDdMmYyyy: string;
}): string {
  const instance = String(input.instanceSerial ?? '').trim();
  if (instance) return instance;

  const master = String(input.scheduleMasterSerial ?? '').trim();
  const ymd = ddMmYyyyToCompactYmd(input.operationDateDdMmYyyy);
  if (!master || !ymd) {
    throw new Error(
      'scheduleMasterSerial and operationDate are required for daily override key',
    );
  }
  // Synthetic key when instance serial not yet allocated — still day-scoped.
  return `${master}|${ymd}`;
}

/** Convert dd/MM/yyyy → YYYYMMDD for compact keys. */
export function ddMmYyyyToCompactYmd(dateDdMmYyyy: string): string {
  const raw = String(dateDdMmYyyy ?? '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!m) return '';
  return `${m[3]}${m[2]}${m[1]}`;
}

/** Normalize free-form date labels to dd/MM/yyyy when possible. */
export function normalizeOperationDateDdMmYyyy(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (ddmmyyyy) return raw;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (compact) return `${compact[3]}/${compact[2]}/${compact[1]}`;
  return '';
}

/** True when serial looks like a day-scoped override key (`master|YYYYMMDD`). */
export function isSyntheticDailyOverrideKey(serialNo: string): boolean {
  return /^\d{6}\|\d{8}$/.test(String(serialNo ?? '').trim());
}

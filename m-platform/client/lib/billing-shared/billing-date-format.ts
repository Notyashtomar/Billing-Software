/**
 * Billing date display vs wire format.
 *
 * - Wire / API / `<input type="date">` value: always `yyyy-mm-dd` (ISO calendar day).
 * - User-visible text: always `dd-mm-yyyy` (or `dd-mm-yyyy → dd-mm-yyyy` for ranges).
 * Never show `yyyy-mm-dd` in labels, tables, PDFs, or guidance copy.
 */

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Normalize any common date input to `yyyy-mm-dd` for APIs and comparisons. */
export function toBillingIsoDate(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    // Calendar days are stored as UTC midnight — use UTC parts so UI day never shifts.
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const iso = ISO_YMD.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = DMY_SLASH.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
  }
  return '';
}

/** User-facing date: `dd-mm-yyyy`. Empty / invalid → `—` (or custom empty). */
export function formatBillingDate(
  value: string | Date | null | undefined,
  empty = '—',
): string {
  const iso = toBillingIsoDate(value);
  if (!iso) return empty;
  const match = ISO_YMD.exec(iso);
  if (!match) return empty;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** User-facing range: `dd-mm-yyyy → dd-mm-yyyy`. */
export function formatBillingDateRange(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
  options?: { empty?: string; openEndedTo?: boolean; separator?: string },
): string {
  const empty = options?.empty ?? '—';
  const sep = options?.separator ?? ' → ';
  const left = formatBillingDate(from, '');
  if (options?.openEndedTo) {
    return left ? `${left}${sep}Open` : empty;
  }
  const right = formatBillingDate(to, '');
  if (left && right) return `${left}${sep}${right}`;
  if (left) return left;
  if (right) return right;
  return empty;
}

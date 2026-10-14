import { FORM_OTHER_OPTION } from '@/lib/org-structure-options';

/** Case-insensitive match against canonical list values (excludes "Other"). */
export function matchCanonicalOption(
  value: string,
  options: readonly string[],
): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === FORM_OTHER_OPTION) return null;

  const exact = options.find((option) => option === trimmed);
  if (exact) return exact;

  const normalized = trimmed.toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) ?? null;
}

/** Deduplicate option labels case-insensitively while preserving first spelling. */
export function dedupeSelectOptions(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed || trimmed === FORM_OTHER_OPTION) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export type BuildSearchableSelectOptionsParams = {
  /** Include a trailing "Other" row for custom entry. */
  includeOther?: boolean;
  /** Current committed value — shown only in the input, not duplicated in the list. */
  currentValue?: string;
};

/**
 * Canonical dropdown rows: deduped base list + optional "Other".
 * Custom values are not duplicated as extra list rows.
 */
export function buildSearchableSelectOptions(
  baseOptions: readonly string[],
  params: BuildSearchableSelectOptionsParams = {},
): string[] {
  const { includeOther = true, currentValue } = params;
  const deduped = dedupeSelectOptions(baseOptions);

  const current = currentValue?.trim();
  if (
    current &&
    current !== FORM_OTHER_OPTION &&
    !matchCanonicalOption(current, deduped)
  ) {
    // Custom value is valid but must not appear twice in the list.
    // It remains visible in the input via the controlled value prop.
  }

  if (includeOther) {
    return [...deduped, FORM_OTHER_OPTION];
  }
  return deduped;
}

/**
 * Resolve a raw input to a stored value:
 * - snaps to canonical spelling when matching an existing option
 * - rejects bare "Other"
 * - trims custom unique values
 */
export function resolveCommittedSelectValue(
  raw: string,
  baseOptions: readonly string[],
): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === FORM_OTHER_OPTION) return '';

  const canonical = matchCanonicalOption(trimmed, baseOptions);
  return canonical ?? trimmed;
}

export function isBareOtherSelection(value: string): boolean {
  return value.trim() === FORM_OTHER_OPTION;
}

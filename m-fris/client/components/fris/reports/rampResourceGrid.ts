/** Shared Summary of Resources grid dimensions (must match RampSummaryOfResourcesSection). */

export const RAMP_RESOURCE_ROW_COUNT = 10;
export const RAMP_RESOURCE_COL_COUNT = 22;

export function emptyResourceGrid(): string[][] {
  return Array.from({ length: RAMP_RESOURCE_ROW_COUNT }, () =>
    Array.from({ length: RAMP_RESOURCE_COL_COUNT }, () => ''),
  );
}

export function normalizeResourceGrid(input: string[][] | undefined): string[][] {
  const base = emptyResourceGrid();
  if (!input?.length) return base;
  for (let r = 0; r < RAMP_RESOURCE_ROW_COUNT; r++) {
    const src = input[r];
    if (!src) continue;
    for (let c = 0; c < RAMP_RESOURCE_COL_COUNT; c++) {
      base[r]![c] = String(src[c] ?? '').trim();
    }
  }
  return base;
}

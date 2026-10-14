/** Station GHA delay codes (whitelist) — leading two digits of reason-of-delay text. */
export const FHR_GHA_STATION_DELAY_CODES = [
  11, 12, 13, 15, 17, 18, 19, 21, 22, 23, 28, 29, 31, 32, 33, 34, 35, 37, 38,
  39, 52,
] as const;

export const FHR_GHA_STATION_DELAY_CODE_SET = new Set<number>(
  FHR_GHA_STATION_DELAY_CODES,
);

/** Allowed values for `airlineRemarksRating` (Mongo + client + dashboard). */
export const AIRLINE_REMARKS_RATING_VALUES = [
  'Not Satisfactory',
  'Below Average',
  'Satisfactory',
  'Good',
  'Excellent',
] as const;

/** Dashboard row for handled flights with empty `remarks.airlineRemarksRating`. */
export const AIRLINE_REMARKS_BLANK_LABEL = 'Blanks' as const;

export type AirlineRemarksRatingValue =
  (typeof AIRLINE_REMARKS_RATING_VALUES)[number];

export function isAirlineRemarksRating(
  value: string,
): value is AirlineRemarksRatingValue {
  return (AIRLINE_REMARKS_RATING_VALUES as readonly string[]).includes(value);
}

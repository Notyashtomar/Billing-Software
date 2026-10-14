/** Default operational recipients for Shoot / Send email modals (cancellation history, Pax shift report, etc.). */
export const BIRD_SHOOT_EMAIL_OPTIONS = [
  'jb@bird.in',
  'shs@bird.in',
  'st@bird.in',
  'yashraj.tomer@birdgsec.in',
  'sj@bird.in',
] as const;

export type BirdShootEmailOption = (typeof BIRD_SHOOT_EMAIL_OPTIONS)[number];

export function emptyBirdShootEmailSelection(): Record<string, boolean> {
  return Object.fromEntries(
    BIRD_SHOOT_EMAIL_OPTIONS.map((email) => [email, false]),
  ) as Record<string, boolean>;
}

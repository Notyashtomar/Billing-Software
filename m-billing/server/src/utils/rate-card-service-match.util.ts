/**
 * Fuzzy service match for a longer catalog name.
 * "Deep Cleaning" may match "Deep Cleaning - NB".
 * "Scheduled Flight" must not match "Non Scheduled Flight - WCHC".
 */
export function serviceCodeContainsParticular(codeKey: string, particularKey: string): boolean {
  const slice = particularKey.slice(0, 12);
  if (slice.length < 8) return false;
  const at = codeKey.indexOf(slice);
  if (at < 0) return false;
  const before = codeKey.slice(0, at);
  if (/(^|[^a-z])non\s*$/.test(before)) return false;
  return true;
}

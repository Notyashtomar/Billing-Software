/** Ignore mismatched API bodies when a slow response returns after the user changed the range. */
export function dashboardBundleMatchesRequestedRange(
  bundle: { from?: string; to?: string },
  reqFrom: string,
  reqTo: string,
): boolean {
  return (
    String(bundle.from ?? '').trim() === String(reqFrom).trim() &&
    String(bundle.to ?? '').trim() === String(reqTo).trim()
  );
}

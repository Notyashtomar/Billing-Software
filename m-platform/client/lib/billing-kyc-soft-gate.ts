/** Detect Nest KYC soft-gate ConflictException and prompt for override. */

export function isKycSoftGateError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    /KYC_SOFT_GATE/i.test(msg) ||
    /No KYC case/i.test(msg) ||
    /KYC for .+ is/i.test(msg) ||
    /continue anyway/i.test(msg)
  );
}

export function promptKycOverride(message: string): string | null {
  const reason = window.prompt(
    `${message}\n\nType a short reason to continue anyway (or Cancel):`,
    '',
  );
  const trimmed = reason?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function withKycSoftGateRetry<T>(
  messageFromError: unknown,
  retry: (override: { kycOverride: true; kycOverrideReason: string }) => Promise<T>,
): Promise<T> {
  const msg =
    messageFromError instanceof Error
      ? messageFromError.message
      : String(messageFromError ?? 'KYC not approved');
  const reason = promptKycOverride(msg);
  if (!reason) throw messageFromError instanceof Error ? messageFromError : new Error(msg);
  return retry({ kycOverride: true, kycOverrideReason: reason });
}

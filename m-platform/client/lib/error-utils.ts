export function getErrorMessage(err: unknown, defaultMessage = 'An error occurred'): string {
  if (err instanceof Error) {
    if (err.message.includes('fetch')) {
      return 'Network error. Please check your connection and try again.';
    }
    if (err.message.includes('E11000') || err.message.includes('duplicate')) {
      return 'A duplicate record already exists.';
    }
    // We explicitly avoid returning the raw err.message for generic/unhandled backend errors
    // unless it's a known safe message, but for UI polish, we just return a friendly default
    // or a sanitized version. Since we don't have a whitelist, we will use the default message 
    // unless the error provides a known user-friendly signature.
  }
  return typeof err === 'string' ? err : defaultMessage;
}

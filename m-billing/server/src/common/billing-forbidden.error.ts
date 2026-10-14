/** Framework-free 403 — mapped to HTTP 403 by BillingForbiddenErrorFilter in Nest. */
export class BillingForbiddenError extends Error {
  readonly statusCode = 403 as const;

  constructor(message: string) {
    super(message);
    this.name = 'BillingForbiddenError';
  }
}

import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';

export const REQUEST_ID_HEADER = 'x-request-id';

export function getOrCreateRequestId(req: Request): string {
  const existing = String(
    req.headers[REQUEST_ID_HEADER] ?? req.headers['x-correlation-id'] ?? '',
  ).trim();
  if (existing) {
    (req as Request & { requestId?: string }).requestId = existing;
    return existing;
  }
  const id = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  (req as Request & { requestId?: string }).requestId = id;
  return id;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export function getPrincipalFromRequest(
  req: Request,
): AuthenticatedPrincipal | undefined {
  return (req as Request & { user?: AuthenticatedPrincipal }).user;
}

export function getRouteLabel(req: Request): string {
  const base = req.baseUrl ?? '';
  const path = req.route?.path
    ? `${base}${req.route.path}`
    : (req.originalUrl ?? req.url ?? '').split('?')[0];
  return path || req.url || 'unknown';
}

/** Request-scoped abort: set by RequestTimeoutInterceptor; services may honor it. */
export type RequestWithAbort = Request & {
  abortController?: AbortController;
  abortSignal?: AbortSignal;
};

/**
 * Ensure an AbortController exists on the request and abort when the client
 * disconnects (browser AbortController / proxy forwards close).
 * Uses `aborted` (not `close`) so normal response completion does not abort
 * intentional fire-and-forget work after the handler returns.
 */
export function ensureRequestAbortController(req: Request): AbortController {
  const r = req as RequestWithAbort;
  if (r.abortController) return r.abortController;

  const controller = new AbortController();
  r.abortController = controller;
  r.abortSignal = controller.signal;

  const onAborted = () => {
    if (!controller.signal.aborted) {
      controller.abort('client disconnected');
    }
  };
  req.once('aborted', onAborted);
  controller.signal.addEventListener(
    'abort',
    () => {
      req.off('aborted', onAborted);
    },
    { once: true },
  );

  return controller;
}

export function getRequestAbortSignal(req: Request): AbortSignal | undefined {
  return (req as RequestWithAbort).abortSignal;
}

const DIRECT_API_DEFAULT = 'http://127.0.0.1:8080';

/**
 * NestJS API base URL (no trailing slash).
 * Same rules as documented on the shared API helper — kept tiny so login and light pages avoid importing `api.ts`.
 */
export function getApiBase(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      DIRECT_API_DEFAULT
    ).replace(/\/$/, '');
  }

  // Browser traffic should stay same-origin so auth cookies are first-party
  // and readable to Next proxy/layout enforcement.
  return '/api-backend';
}

/**
 * Shared k6 configuration for FRIS protection smoke load tests.
 * Usage: k6 run -e BASE_URL=https://staging.example.com -e JWT=... test/k6/shared-ip-dashboard.js
 */
export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
export const JWT = __ENV.JWT || '';
export const SHARED_IP = __ENV.SHARED_IP || '203.0.113.50';

export const defaultHeaders = {
  'Content-Type': 'application/json',
  ...(JWT ? { Authorization: `Bearer ${JWT}` } : {}),
  'X-Forwarded-For': SHARED_IP,
};

export const thresholds = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<5000'],
  /** Track 429 rate during rollout — should stay near 0 in monitor-only */
  http_status_429: ['count<100'],
};

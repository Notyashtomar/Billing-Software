import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, JWT, SHARED_IP, defaultHeaders, thresholds } from './config.js';

/**
 * Simulates 100 employees behind one NAT polling dashboard endpoints.
 */
export const options = {
  scenarios: {
    shared_ip_poll: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 4,
      maxDuration: '3m',
    },
  },
  thresholds,
};

export default function () {
  const userId = `EMP${String(1000 + __VU).padStart(4, '0')}`;
  const headers = {
    ...defaultHeaders,
    'X-Forwarded-For': SHARED_IP,
    'X-Test-User-Id': userId,
  };

  const paths = ['/dashboard-summary', '/dashboard-summary/latest'];
  for (const path of paths) {
    const res = http.get(`${BASE_URL}${path}`, { headers });
    check(res, {
      'not server error': (r) => r.status < 500,
      'no false 429 in monitor rollout': (r) => r.status !== 429 || __ENV.ALLOW_429 === '1',
    });
  }
  sleep(0.1);
}

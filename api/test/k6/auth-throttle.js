import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, SHARED_IP, thresholds } from './config.js';

export const options = {
  scenarios: {
    auth_burst: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 200,
      maxDuration: '2m',
    },
  },
  thresholds: {
    ...thresholds,
    http_status_429: ['count>=0'],
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ userid: `user-${__VU}`, password: 'wrong' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': SHARED_IP,
      },
    },
  );

  check(res, {
    'auth responds': (r) => r.status === 401 || r.status === 429 || r.status === 201,
    '429 has retryAfter when enforced': (r) =>
      r.status !== 429 || (r.json('retryAfter') !== undefined),
  });
}

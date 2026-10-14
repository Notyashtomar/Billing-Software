import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, JWT, defaultHeaders, thresholds } from './config.js';

export const options = {
  scenarios: {
    operations_mix: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds,
};

const routes = [
  { method: 'GET', path: '/dashboard-summary/latest' },
  { method: 'GET', path: '/reports/quality-scheduled-table' },
  { method: 'GET', path: '/exports/report' },
];

export default function () {
  const route = routes[__ITER % routes.length];
  const res =
    route.method === 'GET'
      ? http.get(`${BASE_URL}${route.path}`, { headers: defaultHeaders })
      : http.post(`${BASE_URL}${route.path}`, null, { headers: defaultHeaders });

  check(res, {
    'status acceptable': (r) => r.status < 500,
  });
  sleep(0.2);
}

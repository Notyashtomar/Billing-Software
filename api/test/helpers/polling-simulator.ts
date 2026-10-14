/**
 * Replays dashboard polling as request bursts (no wall-clock sleeps — CI-safe).
 */
export type PollingProfile = {
  /** Logical name for reporting */
  name: string;
  path: string;
  /** Requests per simulated tab per "cycle" */
  requestsPerCycle: number;
  /** Simulated open tabs per user */
  tabs: number;
  /** Simulated polling cycles (e.g. 2 minutes / 30s interval = 4) */
  cycles: number;
};

/** Typical Bird dashboard: bundle + latest every ~30s, multiple widgets. */
export const DASHBOARD_POLLING_PROFILES: PollingProfile[] = [
  {
    name: 'dashboard-summary-main',
    path: '/dashboard-summary',
    requestsPerCycle: 1,
    tabs: 2,
    cycles: 4,
  },
  {
    name: 'dashboard-summary-latest',
    path: '/dashboard-summary/latest',
    requestsPerCycle: 1,
    tabs: 2,
    cycles: 4,
  },
  {
    name: 'dashboard-kpi-flights',
    path: '/dashboard-kpi-flights',
    requestsPerCycle: 1,
    tabs: 1,
    cycles: 4,
  },
];

export function expandPollingRequests(
  profiles: PollingProfile[],
): { path: string; profile: string }[] {
  const out: { path: string; profile: string }[] = [];
  for (const profile of profiles) {
    const total =
      profile.requestsPerCycle * profile.tabs * profile.cycles;
    for (let i = 0; i < total; i += 1) {
      out.push({ path: profile.path, profile: profile.name });
    }
  }
  return out;
}

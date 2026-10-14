import { getApiBase } from '@/lib/api';

export type FrisDatabaseStatus = 'online' | 'offline' | 'unknown';

export type FrisHealthSnapshot = {
  databaseStatus: FrisDatabaseStatus;
  databaseLatencyMs?: number;
  serverUptimeHuman?: string;
  checkedAt: string;
};

export type FrisProcessHealth = {
  pid: number;
  nodeVersion: string;
  uptimeHuman: string;
  uptimeSeconds?: number;
  heapUsedHuman: string;
  heapTotalHuman: string;
  heapPressurePct: number;
  rssHuman: string;
};

export type FrisHealthFullSnapshot = FrisHealthSnapshot & {
  livenessStatus: 'ok' | 'degraded';
  mongoStatus?: 'up' | 'down';
  process?: FrisProcessHealth;
  /** Uptime seconds from liveness when full process metrics are unavailable. */
  serverUptimeSeconds?: number;
};

type LivenessPayload = {
  status?: string;
  uptime?: { seconds?: number; human?: string };
};

type FormattedMetric = { bytes?: number; human?: string };
type DurationMetric = { seconds?: number; human?: string };

type FullHealthPayload = {
  status?: string;
  info?: {
    mongodb?: { status?: string };
    process?: {
      pid?: number;
      nodeVersion?: string;
      uptime?: DurationMetric;
      memory?: {
        rss?: FormattedMetric;
        heapUsed?: FormattedMetric;
        heapTotal?: FormattedMetric;
      };
    };
  };
  details?: FullHealthPayload['info'];
};

function parseProcessHealth(raw: FullHealthPayload['info']): FrisProcessHealth | undefined {
  const process = raw?.process;
  if (!process) return undefined;

  const heapUsed = process.memory?.heapUsed?.bytes ?? 0;
  const heapTotal = process.memory?.heapTotal?.bytes ?? 0;
  const heapPressurePct =
    heapTotal > 0 ? Math.min(100, Math.round((heapUsed / heapTotal) * 100)) : 0;

  return {
    pid: process.pid ?? 0,
    nodeVersion: process.nodeVersion ?? '—',
    uptimeHuman: process.uptime?.human ?? '—',
    uptimeSeconds: process.uptime?.seconds,
    heapUsedHuman: process.memory?.heapUsed?.human ?? '—',
    heapTotalHuman: process.memory?.heapTotal?.human ?? '—',
    heapPressurePct,
    rssHuman: process.memory?.rss?.human ?? '—',
  };
}

export async function fetchFrisHealthSnapshot(): Promise<FrisHealthSnapshot> {
  const full = await fetchFrisHealthFull();
  return {
    databaseStatus: full.databaseStatus,
    databaseLatencyMs: full.databaseLatencyMs,
    serverUptimeHuman: full.serverUptimeHuman,
    checkedAt: full.checkedAt,
  };
}

export async function fetchFrisHealthFull(): Promise<FrisHealthFullSnapshot> {
  const base = getApiBase().replace(/\/$/, '');
  const checkedAt = new Date().toISOString();

  let serverUptimeHuman: string | undefined;
  let serverUptimeSeconds: number | undefined;
  let livenessStatus: FrisHealthFullSnapshot['livenessStatus'] = 'degraded';

  try {
    const healthRes = await fetch(`${base}/health`, { cache: 'no-store' });
    if (healthRes.ok) {
      const data = (await healthRes.json().catch(() => ({}))) as LivenessPayload;
      serverUptimeHuman = data.uptime?.human;
      serverUptimeSeconds = data.uptime?.seconds;
      livenessStatus = data.status === 'ok' ? 'ok' : 'degraded';
    }
  } catch {
    // Liveness is optional for diagnostics.
  }

  let process: FrisProcessHealth | undefined;
  let mongoStatus: FrisHealthFullSnapshot['mongoStatus'];

  try {
    const fullRes = await fetch(`${base}/health/full`, { cache: 'no-store' });
    if (fullRes.ok) {
      const data = (await fullRes.json().catch(() => ({}))) as FullHealthPayload;
      const info = data.info ?? data.details;
      process = parseProcessHealth(info);
      serverUptimeHuman = serverUptimeHuman ?? info?.process?.uptime?.human;
      serverUptimeSeconds = serverUptimeSeconds ?? info?.process?.uptime?.seconds;
      const mongo = info?.mongodb?.status;
      mongoStatus = mongo === 'up' ? 'up' : mongo === 'down' ? 'down' : undefined;
    }
  } catch {
    // Extended diagnostics are optional.
  }

  const pingStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const readyRes = await fetch(`${base}/ready`, { cache: 'no-store' });
    const databaseLatencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - pingStart,
    );
    return {
      databaseStatus: readyRes.ok ? 'online' : 'offline',
      databaseLatencyMs,
      serverUptimeHuman,
      serverUptimeSeconds: process?.uptimeSeconds ?? serverUptimeSeconds,
      checkedAt,
      livenessStatus,
      mongoStatus: mongoStatus ?? (readyRes.ok ? 'up' : 'down'),
      process,
    };
  } catch {
    return {
      databaseStatus: 'unknown',
      serverUptimeHuman,
      serverUptimeSeconds: process?.uptimeSeconds ?? serverUptimeSeconds,
      checkedAt,
      livenessStatus,
      mongoStatus,
      process,
    };
  }
}

export function formatDatabaseStatusLabel(status: FrisDatabaseStatus): string {
  if (status === 'online') return 'Online';
  if (status === 'offline') return 'Offline';
  return 'Unreachable';
}

import { INDIA_AIRPORTS } from '@/data/india-airports';
import type { PermissionTabKey } from '@/lib/permission-tab-config';

export type StationStatus = 'Active' | 'Maintenance' | 'Delayed' | 'Offline';

export type StationRegion =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'Central'
  | 'International';

export type StationRecord = {
  id: string;
  name: string;
  code: string; // e.g. DEL-01
  /** Canonical IATA code when provided by admin-stations registry. */
  stationCode?: string;
  company: string;
  region: StationRegion;
  city: string;
  state?: string;
  street?: string;
  addressCity?: string;
  country?: string;
  pincode?: string;
  gstNumber?: string;
  zone: string; // terminal / zone (legacy display; prefer `terminals`)
  terminals?: string[];
  photoUrl?: string;
  departmentCount?: number;
  type: 'Airport' | 'Cargo' | 'Rail' | 'Warehouse' | 'Ops Hub';
  manager: string;
  capacity: number;
  status: StationStatus;
  notes?: string;
  permissions?: {
    accessTabs: PermissionTabKey[];
    accessSubPages: Partial<Record<PermissionTabKey, string[]>>;
  };

  dailyOps: number;
  activeStaff: number;
  efficiencyPct: number; // 0..100
  delayedOps: number;
  weeklyPerf: number[]; // 7 values
  throughputMonth: number[]; // sparkline

  insight: string;
  updatedAt: string; // ISO
};

const STORAGE_KEY = 'admin_station_records_v1';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rand(seed: number) {
  // deterministic-ish
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function isoNow() {
  return new Date().toISOString();
}

export function nextStationCode(existing: StationRecord[], prefix: string) {
  const nums = existing
    .filter((s) => s.code.startsWith(`${prefix}-`))
    .map((s) => Number(s.code.split('-')[1] ?? 0))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

function insightFor(status: StationStatus, eff: number, delayed: number) {
  if (status === 'Maintenance') return 'Maintenance required ⚠️';
  if (status === 'Offline') return 'Station offline — action needed 🛑';
  if (status === 'Delayed' || delayed > 10) return 'Delay rate increased today 📈';
  if (eff >= 86) return 'High traffic detected 🚀';
  return 'Operations running smoothly ✅';
}

function makeStation(i: number): StationRecord {
  const base = 70 + Math.round(rand(i * 11) * 28);
  const statusRoll = rand(i * 7);
  const status: StationStatus =
    statusRoll > 0.92 ? 'Offline' : statusRoll > 0.82 ? 'Maintenance' : statusRoll > 0.68 ? 'Delayed' : 'Active';
  const regionPool: StationRegion[] = ['North', 'South', 'East', 'West', 'Central', 'International'];
  const region = regionPool[i % regionPool.length]!;

  const cityPool = ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Kolkata', 'Chennai', 'Pune', 'Jaipur'];
  const city = cityPool[i % cityPool.length]!;
  const prefixPool = ['DEL', 'BOM', 'BLR', 'HYD', 'CCU', 'MAA', 'PNQ', 'JAI'];
  const prefix = prefixPool[i % prefixPool.length]!;
  const weeklyPerf = Array.from({ length: 7 }, (_, d) =>
    clamp(base + Math.round(10 * Math.sin((i + d) * 0.55)) + Math.round(rand(i * 91 + d * 3) * 8 - 4), 40, 98)
  );
  const eff = clamp(Math.round(weeklyPerf.reduce((s, v) => s + v, 0) / weeklyPerf.length), 35, 98);
  const dailyOps = 140 + Math.round(rand(i * 19) * 540);
  const delayedOps = status === 'Delayed' ? 10 + Math.round(rand(i * 29) * 18) : Math.round(rand(i * 29) * 9);
  const activeStaff = 18 + Math.round(rand(i * 31) * 64);
  const throughputMonth = Array.from({ length: 12 }, (_, m) =>
    clamp(55 + Math.round(rand(i * 47 + m * 13) * 42) + Math.round(8 * Math.sin(m * 0.6 + i * 0.2)), 25, 98)
  );

  return {
    id: `st_${i}_${Math.round(rand(i * 101) * 1e6)}`,
    name: `${city} Station`,
    code: `${prefix}-${String((i % 12) + 1).padStart(2, '0')}`,
    company: i % 2 === 0 ? 'Bird Flight Services Private Limited' : 'Bird Airport Services Private Limited',
    region,
    city,
    zone: `Terminal ${(i % 3) + 1}`,
    type: i % 5 === 0 ? 'Cargo' : 'Airport',
    manager: ['A. Sharma', 'R. Verma', 'N. Singh', 'K. Iyer', 'S. Khan'][i % 5]!,
    capacity: 500 + Math.round(rand(i * 37) * 2400),
    status,
    notes: '',
    dailyOps,
    activeStaff,
    efficiencyPct: eff,
    delayedOps,
    weeklyPerf,
    throughputMonth,
    insight: insightFor(status, eff, delayedOps),
    updatedAt: isoNow(),
  };
}

export function seedStations(): StationRecord[] {
  if (INDIA_AIRPORTS.length === 0) return Array.from({ length: 10 }, (_, i) => makeStation(i + 1));

  const toRegion = (lat: number, lon: number): StationRegion => {
    if (lon > 85) return 'East';
    if (lon < 74) return 'West';
    if (lat > 26) return 'North';
    if (lat < 14) return 'South';
    return 'Central';
  };

  return INDIA_AIRPORTS.map((a, idx) => {
    const statusRoll = rand((idx + 1) * 7);
    const status: StationStatus =
      statusRoll > 0.92 ? 'Offline' : statusRoll > 0.82 ? 'Maintenance' : statusRoll > 0.68 ? 'Delayed' : 'Active';
    const base = 70 + Math.round(rand((idx + 1) * 11) * 28);
    const weeklyPerf = Array.from({ length: 7 }, (_, d) =>
      clamp(
        base +
          Math.round(10 * Math.sin((idx + 1 + d) * 0.55)) +
          Math.round(rand((idx + 1) * 91 + d * 3) * 8 - 4),
        40,
        98
      )
    );
    const eff = clamp(Math.round(weeklyPerf.reduce((s, v) => s + v, 0) / weeklyPerf.length), 35, 98);
    const delayedOps =
      status === 'Delayed'
        ? 10 + Math.round(rand((idx + 1) * 29) * 18)
        : Math.round(rand((idx + 1) * 29) * 9);

    return {
      id: `st_${a.stationCode}_${idx + 1}`,
      name: a.airport,
      code: `${a.stationCode}-${String((idx % 3) + 1).padStart(2, '0')}`,
      company: a.company,
      region: toRegion(a.lat, a.lon),
      city: a.city,
      zone: `Terminal ${(idx % 3) + 1}`,
      type: idx % 5 === 0 ? 'Cargo' : 'Airport',
      manager: ['A. Sharma', 'R. Verma', 'N. Singh', 'K. Iyer', 'S. Khan'][idx % 5]!,
      capacity: 500 + Math.round(rand((idx + 1) * 37) * 2400),
      status,
      notes: '',
      dailyOps: 140 + Math.round(rand((idx + 1) * 19) * 540),
      activeStaff: 18 + Math.round(rand((idx + 1) * 31) * 64),
      efficiencyPct: eff,
      delayedOps,
      weeklyPerf,
      throughputMonth: Array.from({ length: 12 }, (_, m) =>
        clamp(
          55 +
            Math.round(rand((idx + 1) * 47 + m * 13) * 42) +
            Math.round(8 * Math.sin(m * 0.6 + (idx + 1) * 0.2)),
          25,
          98
        )
      ),
      insight: insightFor(status, eff, delayedOps),
      updatedAt: isoNow(),
    };
  });
}

export function loadStationAnalytics(): StationRecord[] {
  if (typeof window === 'undefined') return seedStations();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedStations();
    const parsed = JSON.parse(raw) as StationRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedStations();
    return parsed;
  } catch {
    return seedStations();
  }
}

export function persistStationAnalytics(records: StationRecord[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export type NewStationFormInput = Pick<
  StationRecord,
  | 'name'
  | 'code'
  | 'company'
  | 'city'
  | 'region'
  | 'zone'
  | 'type'
  | 'manager'
  | 'capacity'
  | 'status'
  | 'notes'
> & {
  state?: string;
  street?: string;
  addressCity?: string;
  country?: string;
  pincode?: string;
  gstNumber?: string;
  photoUrl?: string;
  terminals?: string[];
  activeStaff: number;
  departmentCount: number;
  permissions?: StationRecord['permissions'];
};

export function buildNewStation(existing: StationRecord[], form: NewStationFormInput): StationRecord {
  const seed = existing.length + 13;
  const weeklyPerf = Array.from({ length: 7 }, (_, d) =>
    clamp(72 + Math.round(rand(seed * 91 + d * 7) * 22) + Math.round(10 * Math.sin(d * 0.7)), 35, 98)
  );
  const eff = clamp(Math.round(weeklyPerf.reduce((s, v) => s + v, 0) / weeklyPerf.length), 35, 98);
  const status = form.status;
  const delayedOps = status === 'Delayed' ? 12 + Math.round(rand(seed * 29) * 16) : Math.round(rand(seed * 29) * 8);

  const terminals = (form.terminals ?? []).map((t) => t.trim()).filter(Boolean);
  const zone =
    terminals.length > 0
      ? terminals.join(', ')
      : form.zone.trim() || 'Terminal 1';

  const record: StationRecord = {
    id: `st_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
    ...form,
    zone,
    terminals: terminals.length > 0 ? terminals : undefined,
    dailyOps: 160 + Math.round(Math.random() * 520),
    activeStaff: form.activeStaff,
    departmentCount: form.departmentCount,
    permissions: form.permissions,
    efficiencyPct: eff,
    delayedOps,
    weeklyPerf,
    throughputMonth: Array.from({ length: 12 }, () => clamp(55 + Math.round(Math.random() * 40), 25, 98)),
    insight: insightFor(status, eff, delayedOps),
    updatedAt: isoNow(),
  };

  // fallback code if user left it blank
  if (!record.code.trim()) {
    const prefix = (record.city.slice(0, 3) || 'STN').toUpperCase();
    record.code = nextStationCode(existing, prefix);
  }

  return record;
}

export function applyStationFormUpdate(
  existing: StationRecord,
  form: NewStationFormInput,
): StationRecord {
  const terminals = (form.terminals ?? []).map((t) => t.trim()).filter(Boolean);
  const zone =
    terminals.length > 0
      ? terminals.join(', ')
      : form.zone.trim() || existing.zone || 'Terminal 1';

  const record: StationRecord = {
    ...existing,
    name: form.name.trim(),
    code: form.code.trim() || existing.code,
    company: form.company.trim(),
    region: form.region,
    city: form.city.trim(),
    state: form.state?.trim() || undefined,
    street: form.street?.trim() || undefined,
    addressCity: form.addressCity?.trim() || undefined,
    country: form.country?.trim() || undefined,
    pincode: form.pincode?.trim() || undefined,
    gstNumber: form.gstNumber?.trim() || undefined,
    zone,
    terminals: terminals.length > 0 ? terminals : undefined,
    photoUrl: form.photoUrl?.trim() || undefined,
    type: form.type,
    manager: form.manager.trim(),
    capacity: form.capacity,
    status: form.status,
    notes: form.notes?.trim() ?? '',
    activeStaff: form.activeStaff,
    departmentCount: form.departmentCount,
    permissions: form.permissions,
    updatedAt: isoNow(),
  };

  if (!record.code.trim()) {
    record.code = existing.code;
  }

  return record;
}


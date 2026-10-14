/** Shared layout metadata for ramp shift report view / print. */

export const RAMP_RESOURCE_DESCRIPTION_ROWS = [
  'Staff Planned',
  'Staff Actuals',
  'OTime-Staff',
  'OTime-Hrs',
  'Sick',
  'Absent',
  'E/Leave',
  'CL Leave',
  'LWOP',
  'EPIC',
] as const;

type ColGroup = { title: string; subHeaders: string[] };

export const RAMP_RESOURCE_COL_GROUPS: ColGroup[] = [
  { title: 'DM', subHeaders: [''] },
  {
    title: 'SUP',
    subHeaders: ['RAMP', 'BAGG', 'ULD', 'GSD', 'TTL', 'TL1', 'TL2', 'TL3'],
  },
  { title: 'TL', subHeaders: ['RAMP', 'BMA', 'BBA', 'ULD', 'IT', 'ADM', 'TTL'] },
  { title: 'Eqt opt', subHeaders: ['PBT', 'EQOP-I/II', 'TSU/WSU', 'TTL'] },
  { title: 'Drivers', subHeaders: [''] },
  { title: 'UHD', subHeaders: [''] },
];

export type RampResourceColMeta = {
  groupIndex: number;
  subLabel: string;
  isTtl: boolean;
  isFirstInGroup: boolean;
};

export const RAMP_RESOURCE_COLUMN_META: RampResourceColMeta[] = (() => {
  const out: RampResourceColMeta[] = [];
  RAMP_RESOURCE_COL_GROUPS.forEach((g, gIdx) => {
    g.subHeaders.forEach((sub, sIdx) => {
      out.push({
        groupIndex: gIdx,
        subLabel: sub,
        isTtl: sub.trim().toUpperCase() === 'TTL',
        isFirstInGroup: sIdx === 0,
      });
    });
  });
  return out;
})();

export const RAMP_FLIGHT_ROW_KEYS = [
  'airline',
  'fltNo',
  'reportNo',
  'bayArr',
  'bayDep',
  'arrivalSta',
  'arrivalEta',
  'arrivalAta',
  'holdOpen',
  'holdClose',
  'diffAta1stBag',
  'diff1stBag',
  'diffLastBag',
  'diffLbAta',
  'depStd',
  'depEtd',
  'depAtd',
  'delay1',
  'delay1Mins',
  'delay2',
  'delay2Mins',
  'supvrName',
  'teamAtBay',
  'lastCargoLot',
  'brs',
  'chk',
] as const;

export type RampFlightRowKey = (typeof RAMP_FLIGHT_ROW_KEYS)[number];

export function rampResourceGroupStarts(): { title: string; colSpan: number }[] {
  return RAMP_RESOURCE_COL_GROUPS.map((g) => ({
    title: g.title,
    colSpan: g.subHeaders.length,
  }));
}

/** Single-column groups (DM, Drivers, UHD) use one header cell spanning both header rows. */
export function rampResourceGroupRowSpanOnly(group: ColGroup): boolean {
  return group.subHeaders.length === 1 && !String(group.subHeaders[0] ?? '').trim();
}

export const RAMP_RESOURCE_TABLE_COL_COUNT = 1 + RAMP_RESOURCE_COLUMN_META.length;

export function sumIntegerFields(...values: string[]): string {
  let sum = 0;
  let any = false;
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (!t) continue;
    const n = parseInt(t, 10);
    if (!Number.isNaN(n)) {
      sum += n;
      any = true;
    }
  }
  return any ? String(sum) : '';
}

export function formatYmdToDisplayDate(ymd: string): string {
  const p = ymd.split('-').map((s) => s.trim());
  if (p.length !== 3) return ymd || '—';
  const [y, m, d] = p;
  if (!y || !m || !d) return '—';
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

/** Second header row under scheduled / non-scheduled flight tables (view + print). */
export const RAMP_FLIGHT_SUB_HEADERS: { id: string; label: string }[] = [
  { id: 'bay-arr', label: 'Arr' },
  { id: 'bay-dep', label: 'Dep' },
  { id: 'arr-sta', label: 'STA' },
  { id: 'arr-eta', label: 'ETA' },
  { id: 'arr-ata', label: 'ATA' },
  { id: 'dep-std', label: 'STD' },
  { id: 'dep-etd', label: 'ETD' },
  { id: 'dep-atd', label: 'ATD' },
  { id: 'delay-1', label: 'Delay-1' },
  { id: 'delay-1-mins', label: 'Mins' },
  { id: 'delay-2', label: 'Delay-2' },
  { id: 'delay-2-mins', label: 'Mins' },
  { id: 'bag-brs', label: 'BRS' },
  { id: 'bag-chk', label: 'CHK' },
];

export function dayOfWeekFromYmd(ymd: string): string {
  const p = ymd.split('-').map((s) => parseInt(s.trim(), 10));
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return '—';
  const [y, m, d] = p;
  const dt = new Date(y!, m! - 1, d!);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { weekday: 'long' });
}

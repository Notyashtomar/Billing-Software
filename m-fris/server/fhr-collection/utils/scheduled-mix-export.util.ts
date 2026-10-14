import type { ScheduledMixCountedFlightRow } from '../dto/scheduled-mix-counted-flight.dto';
import { SCHEDULED_MIX_BUCKET_KEYS } from '../dto/scheduled-mix-counted-flight.dto';

export const SCHEDULED_MIX_CATEGORY_DESCRIPTIONS: Record<
  (typeof SCHEDULED_MIX_BUCKET_KEYS)[number],
  string
> = {
  'SCH-I-P-NB': 'Scheduled · International · Passenger · Narrow body',
  'SCH-I-P-WB': 'Scheduled · International · Passenger · Wide body',
  'SCH-D-P-NB': 'Scheduled · Domestic · Passenger · Narrow body',
  'SCH-D-P-WB': 'Scheduled · Domestic · Passenger · Wide body',
  'SCH-I-F-NB': 'Scheduled · International · Freighter · Narrow body',
  'SCH-I-F-WB': 'Scheduled · International · Freighter · Wide body',
  'SCH-D-F-NB': 'Scheduled · Domestic · Freighter · Narrow body',
  'SCH-D-F-WB': 'Scheduled · Domestic · Freighter · Wide body',
};

export function sortUniqueSerials(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

export type ScheduledMixBucketsAggregate = {
  byBucket: Record<string, number>;
  breakdownTotal: number;
  serialsByBucket: Map<string, number[]>;
  missingSerialRowsByBucket: Map<string, ScheduledMixCountedFlightRow[]>;
};

export function aggregateScheduledMixBuckets(
  rows: ScheduledMixCountedFlightRow[],
): ScheduledMixBucketsAggregate {
  const byBucket: Record<string, number> = {};
  for (const k of SCHEDULED_MIX_BUCKET_KEYS) byBucket[k] = 0;
  for (const r of rows) {
    byBucket[r.mixCategory] = (byBucket[r.mixCategory] ?? 0) + 1;
  }

  const serialsByBucket = new Map<string, number[]>();
  const missingSerialRowsByBucket = new Map<
    string,
    ScheduledMixCountedFlightRow[]
  >();
  for (const k of SCHEDULED_MIX_BUCKET_KEYS) {
    serialsByBucket.set(k, []);
    missingSerialRowsByBucket.set(k, []);
  }

  for (const r of rows) {
    const bucket = r.mixCategory;
    if (!serialsByBucket.has(bucket)) continue;
    if (r.serialNo != null && Number.isFinite(r.serialNo)) {
      serialsByBucket.get(bucket)!.push(r.serialNo);
    } else {
      missingSerialRowsByBucket.get(bucket)!.push(r);
    }
  }

  const breakdownTotal = Object.values(byBucket).reduce((s, n) => s + n, 0);
  return {
    byBucket,
    breakdownTotal,
    serialsByBucket,
    missingSerialRowsByBucket,
  };
}

function mdCell(s: unknown): string {
  const t = s == null ? '' : String(s);
  return t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** Markdown subsection per SCH bucket (flight serial lists). */
export function flightSerialsByCategoryMarkdown(
  rows: ScheduledMixCountedFlightRow[],
): string {
  const { serialsByBucket, missingSerialRowsByBucket } =
    aggregateScheduledMixBuckets(rows);
  const parts: string[] = [];

  for (const k of SCHEDULED_MIX_BUCKET_KEYS) {
    const sorted = sortUniqueSerials(serialsByBucket.get(k) ?? []);
    const missing = missingSerialRowsByBucket.get(k) ?? [];
    const desc = SCHEDULED_MIX_CATEGORY_DESCRIPTIONS[k];
    const countInBucket = sorted.length + missing.length;

    parts.push(`### \`${k}\``);
    parts.push('');
    parts.push(`*${desc}*`);
    parts.push('');
    parts.push(`**Flights in this bucket:** ${countInBucket}`);
    parts.push('');
    parts.push('**Flight serial numbers:**');
    parts.push('');
    if (sorted.length === 0 && missing.length === 0) {
      parts.push('*None.*');
      parts.push('');
      continue;
    }
    if (sorted.length > 0) {
      parts.push('```');
      parts.push(sorted.join('\n'));
      parts.push('```');
      parts.push('');
    }
    if (missing.length > 0) {
      parts.push(
        '*Rows without a resolvable serial (STA date · composite flight no for traceability):*',
      );
      parts.push('');
      parts.push('| STA (YMD) | Flight no | TypeCraft |');
      parts.push('| --- | --- | --- |');
      for (const r of missing) {
        parts.push(
          `| ${mdCell(r.staYmd)} | ${mdCell(r.flightNo)} | ${mdCell(r.typeCraftRaw)} |`,
        );
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}

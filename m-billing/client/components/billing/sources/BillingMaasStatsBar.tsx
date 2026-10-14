'use client';

import { billingUi } from '../billingUi';
import type { MaasBillingStats } from './billingMaasDisplay';

type Props = {
  stats: MaasBillingStats;
  loading?: boolean;
};

const CHIP_TONE: Record<string, string> = {
  accent: 'text-[color:var(--billing-accent-strong)]',
  success: 'text-[color:var(--billing-success)]',
  danger: 'text-[color:var(--billing-danger)]',
  muted: 'text-[color:var(--billing-heading)]',
};

function Chip({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: number;
  tone?: keyof typeof CHIP_TONE;
}) {
  return (
    <div className={`${billingUi.card} flex min-w-[7.5rem] flex-1 flex-col gap-0.5 px-3 py-2.5`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
        {label}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${CHIP_TONE[tone]}`}>{value}</span>
    </div>
  );
}

export function BillingMaasStatsBar({ stats, loading }: Props) {
  const zero = {
    escorts: 0,
    passengers: 0,
    singleEscorts: 0,
    groupEscorts: 0,
    dayShift: 0,
    nightShift: 0,
    whiteGlove: 0,
    blueGlove: 0,
    eligible: 0,
    errors: 0,
  };
  const s = loading ? zero : stats;
  return (
    <section
      aria-label="MAAS escort billing summary"
      className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      <Chip label="Escorts" value={s.escorts} tone="accent" />
      <Chip label="Passengers" value={s.passengers} tone="accent" />
      <Chip label="Single escorts" value={s.singleEscorts} />
      <Chip label="Group escorts" value={s.groupEscorts} />
      <Chip label="Day shift" value={s.dayShift} />
      <Chip label="Night shift" value={s.nightShift} />
      <Chip label="White glove" value={s.whiteGlove} />
      <Chip label="Blue glove" value={s.blueGlove} />
      <Chip label="Eligible" value={s.eligible} tone="success" />
      <Chip label="Errors" value={s.errors} tone="danger" />
    </section>
  );
}

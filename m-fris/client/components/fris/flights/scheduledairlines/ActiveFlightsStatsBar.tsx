'use client';

import { motion } from 'framer-motion';
import type { ActiveFlightsStatItem } from '@/utils/scheduledAirlinesActiveStats';
import { cn } from '@/lib/utils';

type ActiveFlightsStatsBarProps = {
  items: ActiveFlightsStatItem[];
  loading?: boolean;
};

function StatChip({
  item,
  index,
  loading,
}: {
  item: ActiveFlightsStatItem;
  index: number;
  loading?: boolean;
}) {
  const showSwatch = item.showSwatch !== false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.015, 0.2), ease: 'easeOut' }}
      className={cn(
        'flex min-h-[52px] min-w-0 flex-col justify-center gap-1 rounded-xl border px-3 py-2.5 shadow-sm',
        item.chipClass,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {showSwatch ? (
          <span
            className={cn('h-2.5 w-2.5 shrink-0 rounded-[2px] ring-1 ring-black/10', item.swatchClass)}
            aria-hidden
          />
        ) : null}
        <span className="truncate text-xs font-medium leading-tight text-gray-800 sm:text-[13px]">
          {item.label}
        </span>
      </div>
      <span className={cn('tabular-nums text-lg font-bold leading-none sm:text-xl', item.countClass)}>
        {loading ? (
          <span className="inline-block h-6 w-12 animate-pulse rounded bg-black/10" aria-hidden />
        ) : (
          item.value.toLocaleString()
        )}
      </span>
    </motion.div>
  );
}

function StatRow({
  items,
  loading,
  gridClass,
  rowOffset,
}: {
  items: ActiveFlightsStatItem[];
  loading?: boolean;
  gridClass: string;
  rowOffset: number;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn('grid gap-2', gridClass)}>
      {items.map((item, index) => (
        <StatChip
          key={item.id}
          item={item}
          index={rowOffset + index}
          loading={loading}
        />
      ))}
    </div>
  );
}

export default function ActiveFlightsStatsBar({ items, loading }: ActiveFlightsStatsBarProps) {
  const row1 = items.filter((i) => i.row === 1);
  const row2 = items.filter((i) => i.row === 2);

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <StatRow
        items={row1}
        loading={loading}
        rowOffset={0}
        gridClass="grid-cols-2 sm:grid-cols-4 xl:grid-cols-8"
      />
      <StatRow
        items={row2}
        loading={loading}
        rowOffset={row1.length}
        gridClass="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      />
    </div>
  );
}

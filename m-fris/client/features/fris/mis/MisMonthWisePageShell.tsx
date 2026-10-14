'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import type { StationWiseFlightScope } from '@/features/fris/mis/mis-pages';

const MisMonthWisePage = dynamic(
  () =>
    import('@/features/fris/mis/MisMonthWisePage').then((m) => m.MisMonthWisePage),
  { ssr: false },
);

export function MisMonthWisePageShell({
  flightScope = 'scheduled',
}: {
  flightScope?: StationWiseFlightScope;
}) {
  return (
    <Suspense fallback={null}>
      <MisMonthWisePage flightScope={flightScope} />
    </Suspense>
  );
}

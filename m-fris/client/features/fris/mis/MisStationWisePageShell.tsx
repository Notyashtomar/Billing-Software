'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import type { StationWiseFlightScope } from '@/features/fris/mis/mis-pages';

const MisStationWisePage = dynamic(
  () =>
    import('@/features/fris/mis/MisStationWisePage').then((m) => m.MisStationWisePage),
  { ssr: false },
);

export function MisStationWisePageShell({
  flightScope = 'scheduled',
}: {
  flightScope?: StationWiseFlightScope;
}) {
  return (
    <Suspense fallback={null}>
      <MisStationWisePage flightScope={flightScope} />
    </Suspense>
  );
}

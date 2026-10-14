'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import type { StationWiseFlightScope } from '@/features/fris/mis/mis-pages';

const MisAirlineWisePage = dynamic(
  () =>
    import('@/features/fris/mis/MisAirlineWisePage').then((m) => m.MisAirlineWisePage),
  { ssr: false },
);

export function MisAirlineWisePageShell({
  flightScope = 'scheduled',
}: {
  flightScope?: StationWiseFlightScope;
}) {
  return (
    <Suspense fallback={null}>
      <MisAirlineWisePage flightScope={flightScope} />
    </Suspense>
  );
}

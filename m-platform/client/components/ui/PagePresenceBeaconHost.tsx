'use client';

import { Suspense } from 'react';
import { PagePresenceBeacon } from '@/components/ui/PagePresenceBeacon';

/** Suspense boundary for useSearchParams inside App Router layouts. */
export function PagePresenceBeaconHost() {
  return (
    <Suspense fallback={null}>
      <PagePresenceBeacon />
    </Suspense>
  );
}

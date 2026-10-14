'use client';

import { Toaster } from '@/components/ui/sonner';
import { PagePresenceBeaconHost } from '@/components/ui/PagePresenceBeaconHost';
import { StaleChunkReload } from '@/components/ui/StaleChunkReload';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaleChunkReload />
      {children}
      <PagePresenceBeaconHost />
      <Toaster position="top-right" richColors />
    </>
  );
}

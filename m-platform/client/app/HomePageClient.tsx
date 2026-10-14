'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageLoading } from '@/components/ui/PageLoading';
import {
  SKIP_LANDING_INTRO_PARAM,
  hasLoginStationContext,
} from '@/lib/login-station-constants';

/** Solid shell — same paint as landing so the client-only Motion tree never hydrates. */
function LandingShell() {
  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#03050d]">
      <PageLoading />
    </div>
  );
}

/**
 * Framer Motion SSR serializes inline styles as kebab-case strings; the client
 * uses camelCase numbers → hydration mismatch. Keep this tree client-only.
 */
const EarthPageClient = dynamic(
  () => import('@/features/landing/EarthPageClient'),
  { ssr: false, loading: () => <LandingShell /> },
);

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skipIntroFromUrl = searchParams.get(SKIP_LANDING_INTRO_PARAM) === '1';

  useEffect(() => {
    if (hasLoginStationContext(searchParams)) {
      router.replace(`/login?${searchParams.toString()}`);
    }
  }, [searchParams, router]);

  return <EarthPageClient skipIntroFromUrl={skipIntroFromUrl} />;
}

export default function HomePageClient() {
  return (
    <Suspense fallback={<LandingShell />}>
      <HomePageInner />
    </Suspense>
  );
}

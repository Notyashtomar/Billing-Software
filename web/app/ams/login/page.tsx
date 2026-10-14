'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const AmsLogin = dynamic(() => import('@/features/ams/AmsLogin'), {
  ssr: false,
  loading: () => <PageLoading />,
});

export default function AmsLoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AmsLogin />
    </Suspense>
  );
}

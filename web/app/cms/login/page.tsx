'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const CmsLogin = dynamic(() => import('@/features/cms/CmsLogin'), {
  ssr: false,
  loading: () => <PageLoading />,
});

export default function CmsLoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CmsLogin />
    </Suspense>
  );
}

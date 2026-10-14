'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CmsReportsPage = dynamic(() => import('@/features/cms/CmsReportsPage'), {
  ssr: false,
  loading: () => <PageLoading />,
});

export default function Page() {
  return <CmsReportsPage />;
}

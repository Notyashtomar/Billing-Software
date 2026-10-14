'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CmsLiveTrackingPage = dynamic(
  () => import('@/features/cms/CmsLiveTrackingPage'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function Page() {
  return <CmsLiveTrackingPage />;
}

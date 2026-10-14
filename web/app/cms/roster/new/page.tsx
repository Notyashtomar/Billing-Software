'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CmsNewRosterPage = dynamic(
  () => import('@/features/cms/CmsNewRosterPage'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function Page() {
  return <CmsNewRosterPage />;
}

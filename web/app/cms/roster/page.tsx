'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CmsRosterPage = dynamic(() => import('@/features/cms/CmsRosterPage'), {
  ssr: false,
  loading: () => <PageLoading />,
});

export default function Page() {
  return <CmsRosterPage />;
}

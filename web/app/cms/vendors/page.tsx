'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CmsVendorsPage = dynamic(() => import('@/features/cms/CmsVendorsPage'), {
  ssr: false,
  loading: () => <PageLoading />,
});

export default function Page() {
  return <CmsVendorsPage />;
}

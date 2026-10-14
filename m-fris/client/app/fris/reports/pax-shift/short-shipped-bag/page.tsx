'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const ShortShippedBagContentDynamic = dynamic(
  () => import('@/components/fris/reports/ShortShippedBagContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ShortShippedBagPage() {
  return <ShortShippedBagContentDynamic />;
}

'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const AdvanceScreenDynamic = dynamic(
  () => import('@/features/fris/advance/AdvanceScreen'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function AdvancePage() {
  return <AdvanceScreenDynamic />;
}

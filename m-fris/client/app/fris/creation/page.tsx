'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const CreationScreenDynamic = dynamic(
  () => import('@/features/fris/creation/CreationScreen'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function CreationPage() {
  return (
    <ErrorBoundary featureName="Flight creation">
      <CreationScreenDynamic />
    </ErrorBoundary>
  );
}

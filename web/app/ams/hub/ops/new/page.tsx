'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/PageLoading';
import AmsNewFormPage from '@/features/ams/AmsNewFormPage';
import AmsPageShell from '@/features/ams/AmsPageShell';
import { isAmsAuthenticated } from '@/features/ams/utils/amsAuth';

export default function AmsOpsNewPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAmsAuthenticated()) {
      router.replace('/ams/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return <PageLoading />;

  return (
    <AmsPageShell wide>
      <AmsNewFormPage />
    </AmsPageShell>
  );
}

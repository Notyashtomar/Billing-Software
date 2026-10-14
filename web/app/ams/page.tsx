'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/PageLoading';
import { AMS_HUB_HREF } from '@/features/ams/theme';
import { isAmsAuthenticated } from '@/features/ams/utils/amsAuth';

/** Hub entry — send authenticated users to AMS ops. */
export default function AmsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isAmsAuthenticated()) {
      router.replace('/ams/login');
      return;
    }
    router.replace(AMS_HUB_HREF);
  }, [router]);

  return <PageLoading />;
}

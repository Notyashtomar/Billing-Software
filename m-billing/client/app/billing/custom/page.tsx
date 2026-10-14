'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Custom operational source removed — Custom bills live on Preparation → Custom. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/billing/preparation?tab=custom');
  }, [router]);
  return null;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Currency & ROE left Airport Setup. Rates live under Master → Conversion Rates. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/billing/conversion-rates');
  }, [router]);
  return null;
}

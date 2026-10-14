'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isReceivablesAuthenticated } from '@/features/bill-receivables/session';

export default function BillReceivablesIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(
      isReceivablesAuthenticated()
        ? '/bill-receivables/import'
        : '/bill-receivables/login',
    );
  }, [router]);
  return null;
}

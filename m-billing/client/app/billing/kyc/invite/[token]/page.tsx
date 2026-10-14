'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PageComponent = dynamic(
  () =>
    import('@/components/billing/kyc/KycInvitePublicPage').then((m) => m.KycInvitePublicPage),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageComponent />
    </Suspense>
  );
}

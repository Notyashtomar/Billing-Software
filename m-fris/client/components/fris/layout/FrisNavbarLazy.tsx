'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const NavbarDynamic = dynamic(() => import('@/components/fris/layout/Navbar'), {
  ssr: false,
  loading: () => <div className="fixed inset-x-0 top-0 z-50 h-12 bg-white/90" aria-hidden />,
});

/** Code-split FRIS nav (~1500 lines) so route chunks compile without pulling the full menu graph. */
export function FrisNavbarLazy() {
  return (
    <Suspense fallback={<div className="fixed inset-x-0 top-0 z-50 h-12 bg-white/90" aria-hidden />}>
      <NavbarDynamic />
    </Suspense>
  );
}

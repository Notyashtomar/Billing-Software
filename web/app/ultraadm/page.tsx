'use client';

/** Standalone shell for /ultraadm. No route layout. */
import dynamic from 'next/dynamic';

const UltraAdminClient = dynamic(
  () => import('@/modules/ultra-admin/UltraAdminClient'),
  {
    ssr: false,
    loading: () => <div style={{ minHeight: '100vh', background: '#030712' }} />,
  },
);

export default function UltraAdmPage() {
  return <UltraAdminClient />;
}

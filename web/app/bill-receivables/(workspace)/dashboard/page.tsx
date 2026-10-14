'use client';

import dynamic from 'next/dynamic';

const DashboardPage = dynamic(() => import('@/features/bill-receivables/DashboardPage').then((m) => m.DashboardPage), {
  ssr: false,
  loading: () => <p className="text-sm text-[#230C33]/60">Loading dashboard…</p>,
});

export default function Page() {
  return <DashboardPage />;
}

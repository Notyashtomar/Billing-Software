'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageLoading } from '@/components/ui/PageLoading';

const PaxDutyAllocationFormDynamic = dynamic(
  () => import('@/components/fris/reports/PaxDutyAllocationForm'),
  { ssr: false, loading: () => <PageLoading /> },
);

/** New Pax Duty Allocation — quick chips include Reservation + CLC. */
export default function PaxDutyAllocationNewPage() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-emerald-50/50 px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
      <div className="w-full">
        <Link
          href="/fris/reports/pax-shift/duty-allocation"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>
        <PaxDutyAllocationFormDynamic
          mode="create"
          onBack={() => router.push('/fris/reports/pax-shift/duty-allocation')}
          onSaved={() => router.push('/fris/reports/pax-shift/duty-allocation')}
        />
      </div>
    </div>
  );
}

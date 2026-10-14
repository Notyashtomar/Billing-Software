'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageLoading } from '@/components/ui/PageLoading';
import { getPaxDutyAllocation } from '@/lib/api';
import { mapPaxDutyAllocationFromApi, type PaxDutyAllocationRecord } from '@/lib/paxDutyAllocationStorage';
import { toast } from 'sonner';

const PaxDutyAllocationFormDynamic = dynamic(
  () => import('@/components/fris/reports/PaxDutyAllocationForm'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function PaxDutyAllocationEditPage() {
  const router = useRouter();
  const params = useParams();
  const idRaw = params?.id;
  const id = typeof idRaw === 'string' ? idRaw : Array.isArray(idRaw) ? idRaw[0] : '';

  const [record, setRecord] = useState<PaxDutyAllocationRecord | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setRecord(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await getPaxDutyAllocation(id);
        if (cancelled) return;
        const mapped = mapPaxDutyAllocationFromApi(raw);
        setRecord(mapped);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Could not load report.');
          setRecord(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const initial = useMemo(() => record ?? undefined, [record]);

  if (record === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">Loading…</div>
    );
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-gray-700">Report not found.</p>
        <Link
          href="/fris/reports/pax-shift/duty-allocation"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-emerald-50/50 px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/fris/reports/pax-shift/duty-allocation"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>
        <PaxDutyAllocationFormDynamic
          mode="edit"
          recordId={record.id}
          initial={initial}
          onBack={() => router.push('/fris/reports/pax-shift/duty-allocation')}
          onSaved={() => router.push('/fris/reports/pax-shift/duty-allocation')}
        />
      </div>
    </div>
  );
}

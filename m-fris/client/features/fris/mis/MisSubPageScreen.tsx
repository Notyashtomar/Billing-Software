'use client';

import { BarChart3 } from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import type { MisPageDef } from '@/features/fris/mis/mis-pages';
import { MisAdsPage } from '@/features/fris/mis/MisAdsPage';

type MisSubPageScreenProps = {
  page: MisPageDef;
};

export function MisSubPageScreen({ page }: MisSubPageScreenProps) {
  if (page.slug === 'ads') {
    return <MisAdsPage />;
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="mx-auto max-w-4xl px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title={page.label} icon={BarChart3} />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm leading-relaxed text-slate-600">
            This workspace is ready for {page.label} content. Use the MIS menu in the navbar to switch
            between related reports.
          </p>
        </div>
      </div>
    </div>
  );
}

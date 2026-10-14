import { notFound } from 'next/navigation';
import { MisAirlineWisePageShell } from '@/features/fris/mis/MisAirlineWisePageShell';
import { MisBhsPageShell } from '@/features/fris/mis/MisBhsPageShell';
import { MisMonthWisePageShell } from '@/features/fris/mis/MisMonthWisePageShell';
import { MisRemarksPageShell } from '@/features/fris/mis/MisRemarksPageShell';
import { MisStationWisePageShell } from '@/features/fris/mis/MisStationWisePageShell';
import { MisSubPageScreen } from '@/features/fris/mis/MisSubPageScreen';
import {
  getMisPageBySlug,
  isAirlineWiseSlug,
  isMonthWiseSlug,
  isStationWiseSlug,
} from '@/features/fris/mis/mis-pages';

export default async function MisSubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getMisPageBySlug(slug);
  if (!page) {
    notFound();
  }

  if (isStationWiseSlug(slug)) {
    return (
      <MisStationWisePageShell
        flightScope={page.flightScope === 'nonScheduled' ? 'nonScheduled' : 'scheduled'}
      />
    );
  }

  if (isMonthWiseSlug(slug)) {
    return (
      <MisMonthWisePageShell
        flightScope={page.flightScope === 'nonScheduled' ? 'nonScheduled' : 'scheduled'}
      />
    );
  }

  if (isAirlineWiseSlug(slug)) {
    return (
      <MisAirlineWisePageShell
        flightScope={page.flightScope === 'nonScheduled' ? 'nonScheduled' : 'scheduled'}
      />
    );
  }

  if (slug === 'remarks') {
    return <MisRemarksPageShell />;
  }

  if (slug === 'bhs') {
    return <MisBhsPageShell />;
  }

  return <MisSubPageScreen page={page} />;
}

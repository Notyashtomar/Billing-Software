'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/PageLoading';
import { getDefaultFrisLandingPath } from '@/lib/fris-route-permissions';
import { parseUserNavFlags } from '@/lib/nav-permissions';

function readStoredPermissionScope(): { accessSubPages?: Record<string, string[]> } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('userPermissionScope');
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as { accessSubPages?: Record<string, string[]> };
  } catch {
    return null;
  }
}

/** Permission-aware FRIS entry — first assigned tab/page, never dashboard by default. */
export default function FrisRootPage() {
  const router = useRouter();

  useEffect(() => {
    const flags = parseUserNavFlags(localStorage.getItem('userFlags'));
    const scope = readStoredPermissionScope();
    const storedLanding = localStorage.getItem('userLandingPath')?.trim();
    const destination =
      storedLanding ||
      getDefaultFrisLandingPath(flags, scope);
    router.replace(destination);
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6 py-16">
      <PageLoading />
    </div>
  );
}

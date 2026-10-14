'use client';

import Link from 'next/link';
import { useEffect, useMemo, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PageLoading } from '@/components/ui/PageLoading';
import { isFrisAdminLikeSession, type FrisPermissionScope } from '@/lib/fris-session';
import { readStoredAppAccess } from '@/lib/bwms-app-tools';
import {
  getDefaultFrisLandingPath,
  isFrisRouteAllowed,
} from '@/lib/fris-route-permissions';
import { useFrisNavFlags } from '@/lib/use-fris-nav-flags';

type AccessState = 'checking' | 'allowed' | 'denied';

function readStoredPermissionScope(): FrisPermissionScope | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('userPermissionScope');
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as FrisPermissionScope;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

type Props = {
  children: ReactNode;
};

/**
 * Blocks FRIS pages when the signed-in panel user lacks admin-assigned permission flags.
 */
export function FrisPermissionGuard({ children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userNavFlags = useFrisNavFlags();

  const { accessState, fallbackPath } = useMemo(() => {
    const permissionScope = readStoredPermissionScope();
    const defaultLanding = getDefaultFrisLandingPath(null, permissionScope);

    if (!pathname) {
      return { accessState: 'checking' as AccessState, fallbackPath: defaultLanding };
    }

    if (isFrisAdminLikeSession()) {
      return { accessState: 'allowed' as AccessState, fallbackPath: defaultLanding };
    }

    const flags = userNavFlags;
    if (!flags || Object.keys(flags).length === 0) {
      return {
        accessState: 'denied' as AccessState,
        fallbackPath: defaultLanding,
      };
    }

    const allowed = isFrisRouteAllowed(pathname, flags, searchParams, {
      appAccess: readStoredAppAccess(),
    });
    return {
      accessState: (allowed ? 'allowed' : 'denied') as AccessState,
      fallbackPath: getDefaultFrisLandingPath(flags, permissionScope),
    };
  }, [pathname, searchParams, userNavFlags]);

  useEffect(() => {
    if (accessState !== 'denied' || !fallbackPath || !pathname) return;
    if (pathname === fallbackPath) return;
    window.location.replace(fallbackPath);
  }, [accessState, fallbackPath, pathname]);

  if (accessState === 'checking' || (accessState === 'denied' && pathname !== fallbackPath)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 py-16">
        <PageLoading />
      </div>
    );
  }

  if (accessState === 'denied') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">You do not have access to this page.</p>
        <p className="mt-2 text-sm text-slate-500">
          Contact your administrator to request access.
        </p>
        <Link
          href={fallbackPath}
          className="mt-6 inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Go to your allowed page
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

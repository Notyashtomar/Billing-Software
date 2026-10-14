import { SetMetadata } from '@nestjs/common';

export const FRIS_PAGE_PERMISSION_KEY = 'frisPagePermission';
export const FRIS_PAGE_PERMISSION_ANY_KEY = 'frisPagePermissionAny';

export type FrisPagePermissionMeta = {
  tab: string;
  pageLabel: string;
};

/** Enforce server-side FRIS page flags (mirrors client nav-permissions). */
export const FrisPagePermission = (tab: string, pageLabel: string) =>
  SetMetadata(FRIS_PAGE_PERMISSION_KEY, {
    tab,
    pageLabel,
  } satisfies FrisPagePermissionMeta);

/** Allow access if the user has ANY of the listed FRIS page permissions. */
export const FrisPagePermissionAny = (...pages: FrisPagePermissionMeta[]) =>
  SetMetadata(FRIS_PAGE_PERMISSION_ANY_KEY, pages);

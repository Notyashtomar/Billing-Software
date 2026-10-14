import type { PermissionTabKey } from '@/lib/permission-tab-config';

/** Minimal FRIS permissions so new admin accounts pass server validation. */
export const DEFAULT_NEW_ADMIN_PERMISSIONS: {
  accessTabs: PermissionTabKey[];
  accessSubPages: Record<PermissionTabKey, string[]>;
} = {
  accessTabs: ['dashboard'],
  accessSubPages: {
    dashboard: ['Dashboard page'],
    creation: [],
    advance: [],
    flights: [],
    reports: [],
    mis: [],
  },
};

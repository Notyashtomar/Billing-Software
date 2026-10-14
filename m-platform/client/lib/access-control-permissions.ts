export type AccessControlViewerRole = 'superadmin' | 'manager' | 'unknown';

export function getAccessControlViewerRole(): AccessControlViewerRole {
  if (typeof window === 'undefined') return 'unknown';
  const role = window.localStorage.getItem('userRole')?.trim().toLowerCase() ?? '';
  if (role === 'superadmin') return 'superadmin';
  if (role === 'manager' || role === 'admin' || role === 'operations') return 'manager';
  return 'unknown';
}

export function canViewAccessControlActions(): boolean {
  const role = getAccessControlViewerRole();
  return role === 'superadmin' || role === 'manager';
}

export function canEditAccessControlUsers(): boolean {
  const role = getAccessControlViewerRole();
  return role === 'superadmin' || role === 'manager';
}

export function canDeleteAccessControlUsers(): boolean {
  return getAccessControlViewerRole() === 'superadmin';
}

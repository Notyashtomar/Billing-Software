import type { AuthenticatedPrincipal } from '../../src/auth/services/identity.service';

export function buildTestPrincipal(
  userid: string,
  role = 'employee',
): AuthenticatedPrincipal {
  return {
    id: `id-${userid}`,
    userId: `mongo-${userid}`,
    userid,
    email: `${userid}@smoke.test`,
    name: `Smoke ${userid}`,
    role,
    accountType: 'user',
    active: true,
  };
}

/** Simulates 50–100 employees behind one NAT IP. */
export function buildSharedOfficeUsers(count: number): AuthenticatedPrincipal[] {
  return Array.from({ length: count }, (_, i) =>
    buildTestPrincipal(`EMP${String(1000 + i).padStart(4, '0')}`),
  );
}

export const SHARED_OFFICE_IP = '203.0.113.50';

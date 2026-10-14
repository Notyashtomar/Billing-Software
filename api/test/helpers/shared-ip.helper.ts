import type { Test } from 'supertest';
import type { AuthenticatedPrincipal } from '../../src/auth/services/identity.service';
import { SHARED_OFFICE_IP } from '../fixtures/users.fixture';

export function withSharedOfficeIp(req: Test): Test {
  return req.set('X-Forwarded-For', SHARED_OFFICE_IP);
}

export function withTestUser(
  req: Test,
  principal: AuthenticatedPrincipal,
): Test {
  return req
    .set('X-Test-User-Id', principal.userid)
    .set('X-Test-User-Role', principal.role);
}

export function withSharedOfficeUser(
  req: Test,
  principal: AuthenticatedPrincipal,
): Test {
  return withSharedOfficeIp(withTestUser(req, principal));
}

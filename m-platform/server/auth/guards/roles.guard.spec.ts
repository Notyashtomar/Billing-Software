import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('returns 401 when role metadata exists but req.user is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('returns 403 when the authenticated role is insufficient', () => {
    reflector.getAllAndOverride.mockReturnValue(['manager']);

    expect(() =>
      guard.canActivate(
        createContext({
          user: { role: 'employee' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('treats a legacy admin token as manager', () => {
    reflector.getAllAndOverride.mockReturnValue(['manager', 'superadmin']);

    expect(
      guard.canActivate(
        createContext({
          user: { role: 'admin' },
        }),
      ),
    ).toBe(true);
  });
});

function createContext(request: Record<string, unknown> = {}): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

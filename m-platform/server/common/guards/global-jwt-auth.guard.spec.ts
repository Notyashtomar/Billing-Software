import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalJwtAuthGuard } from './global-jwt-auth.guard';

describe('GlobalJwtAuthGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: GlobalJwtAuthGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new GlobalJwtAuthGuard(reflector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bypasses authentication for public routes', () => {
    const context = createExecutionContext();
    const parentCanActivate = jest.spyOn(
      Object.getPrototypeOf(GlobalJwtAuthGuard.prototype),
      'canActivate',
    );

    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(parentCanActivate).not.toHaveBeenCalled();
  });

  it('enforces authentication for non-public routes', () => {
    const context = createExecutionContext();
    const parentCanActivate = jest
      .spyOn(Object.getPrototypeOf(GlobalJwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);

    reflector.getAllAndOverride.mockReturnValue(false);

    expect(guard.canActivate(context)).toBe(true);
    expect(parentCanActivate).toHaveBeenCalledWith(context);
  });

  it('returns the authenticated user when present', () => {
    const user = { userId: '123' };

    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('throws a 401 when no authenticated user is present', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
    expect(() => guard.handleRequest(null, null)).toThrow(
      'Authentication is required',
    );
  });
});

function createExecutionContext(): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

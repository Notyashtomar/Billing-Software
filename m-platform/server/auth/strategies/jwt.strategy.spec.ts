import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { IdentityService, JwtPayload } from '../services/identity.service';

describe('JwtStrategy', () => {
  let configService: jest.Mocked<ConfigService>;
  let identityService: jest.Mocked<IdentityService>;
  let strategy: JwtStrategy;

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as jest.Mocked<ConfigService>;

    identityService = {
      resolveActivePrincipal: jest.fn(),
    } as unknown as jest.Mocked<IdentityService>;

    strategy = new JwtStrategy(configService, identityService);
  });

  it('resolves authenticated principals for access tokens', async () => {
    const payload: JwtPayload = {
      sub: '507f1f77bcf86cd799439011',
      email: 'admin@example.com',
      accountType: 'admin',
      role: 'admin',
      purpose: 'access',
    };
    const principal = {
      id: payload.sub,
      userId: payload.sub,
      userid: 'admin-1',
      email: payload.email,
      name: 'Admin User',
      role: 'admin',
      accountType: 'admin' as const,
      active: true,
    };
    identityService.resolveActivePrincipal.mockResolvedValue(principal);

    await expect(strategy.validate(payload)).resolves.toEqual(principal);
    expect(identityService.resolveActivePrincipal).toHaveBeenCalledWith(payload);
  });

  it('supports legacy access tokens without an explicit purpose claim', async () => {
    const payload: JwtPayload = {
      sub: '507f1f77bcf86cd799439011',
      email: 'ops@example.com',
      accountType: 'user',
      role: 'operations',
    };
    const principal = {
      id: payload.sub,
      userId: payload.sub,
      userid: 'ops-1',
      email: payload.email,
      name: 'Ops User',
      role: 'operations',
      accountType: 'user' as const,
      active: true,
    };
    identityService.resolveActivePrincipal.mockResolvedValue(principal);

    await expect(strategy.validate(payload)).resolves.toEqual(principal);
    expect(identityService.resolveActivePrincipal).toHaveBeenCalledWith(payload);
  });

  it('rejects password-reset tokens for bearer authentication', async () => {
    const payload: JwtPayload = {
      sub: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      purpose: 'password-reset',
    };

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(identityService.resolveActivePrincipal).not.toHaveBeenCalled();
  });
});

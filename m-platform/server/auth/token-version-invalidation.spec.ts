import { UnauthorizedException } from '@nestjs/common';
import {
  IdentityService,
  JwtPayload,
} from './services/identity.service';
import { UserService } from '../user/services/user.service';
import { AdminService } from '../admin/services/admin.service';
import { AdminStationsService } from '../admin-stations/services/admin-stations.service';

describe('tokenVersion session invalidation', () => {
  const userId = '507f1f77bcf86cd799439011';
  const adminId = '507f1f77bcf86cd799439012';

  const activeUserRecord = {
    _id: userId,
    userid: 'EMP001',
    name: 'Ops User',
    email: 'ops@example.com',
    role: 'employee',
    authorizationRole: 'employee',
    accountStatus: 'active',
    isActive: true,
    approvalStatus: 'approved',
    registrationStatus: 'approved',
    status: 'Active',
    assignedStationIds: [],
    tokenVersion: 0,
  };

  describe('IdentityService', () => {
    let identityService: IdentityService;
    let userService: jest.Mocked<Pick<UserService, 'findById'>>;
    let adminService: jest.Mocked<Pick<AdminService, 'findById'>>;
    let adminStationsService: jest.Mocked<
      Pick<AdminStationsService, 'resolveStationCodeById'>
    >;

    beforeEach(() => {
      userService = { findById: jest.fn() };
      adminService = { findById: jest.fn() };
      adminStationsService = {
        resolveStationCodeById: jest.fn().mockResolvedValue(null),
      };
      identityService = new IdentityService(
        adminService as unknown as AdminService,
        userService as unknown as UserService,
        adminStationsService as unknown as AdminStationsService,
      );
    });

    function userPayload(
      overrides: Partial<JwtPayload> = {},
    ): JwtPayload {
      return {
        sub: userId,
        email: 'ops@example.com',
        accountType: 'user',
        purpose: 'access',
        tokenVersion: 0,
        ...overrides,
      };
    }

    it('accepts JWT when tokenVersion matches the database', async () => {
      userService.findById.mockResolvedValue(activeUserRecord as never);

      await expect(
        identityService.resolveActivePrincipal(userPayload()),
      ).resolves.toMatchObject({
        userId,
        accountType: 'user',
      });
    });

    it('tokenVersion mismatch returns 401 Session invalidated', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        tokenVersion: 1,
      } as never);

      await expect(
        identityService.resolveActivePrincipal(userPayload({ tokenVersion: 0 })),
      ).rejects.toThrow(new UnauthorizedException('Session invalidated'));
    });

    it('password change invalidates existing JWT (simulated version bump)', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        tokenVersion: 1,
      } as never);

      const tokenBeforePasswordChange = userPayload({ tokenVersion: 0 });

      await expect(
        identityService.resolveActivePrincipal(tokenBeforePasswordChange),
      ).rejects.toThrow('Session invalidated');
    });

    it('disable user invalidates existing JWT via account validation', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        isActive: false,
      } as never);

      await expect(
        identityService.resolveActivePrincipal(userPayload()),
      ).rejects.toThrow(new UnauthorizedException('Account is not active'));
    });

    it('reject user invalidates existing JWT via account validation', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        accountStatus: 'rejected',
        isActive: false,
        approvalStatus: 'rejected',
      } as never);

      await expect(
        identityService.resolveActivePrincipal(userPayload()),
      ).rejects.toThrow(new UnauthorizedException('Account is not active'));
    });

    it('blocked status returns 401 via shared account validation', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        status: 'blocked',
      } as never);

      await expect(
        identityService.resolveActivePrincipal(userPayload()),
      ).rejects.toThrow(new UnauthorizedException('Account is not active'));
    });

    it('role change invalidates existing JWT when tokenVersion is bumped', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        authorizationRole: 'manager',
        tokenVersion: 2,
      } as never);

      await expect(
        identityService.resolveActivePrincipal(
          userPayload({ tokenVersion: 1, role: 'manager' }),
        ),
      ).rejects.toThrow('Session invalidated');
    });

    it('logout-all invalidates existing JWT when tokenVersion is bumped', async () => {
      userService.findById.mockResolvedValue({
        ...activeUserRecord,
        tokenVersion: 3,
      } as never);

      await expect(
        identityService.resolveActivePrincipal(
          userPayload({ tokenVersion: 2 }),
        ),
      ).rejects.toThrow('Session invalidated');
    });

    it('validates admin tokenVersion', async () => {
      adminService.findById.mockResolvedValue({
        _id: adminId,
        userid: 'ADM001',
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin',
        tokenVersion: 0,
      } as never);

      await expect(
        identityService.resolveActivePrincipal({
          sub: adminId,
          email: 'admin@example.com',
          accountType: 'admin',
          purpose: 'access',
          tokenVersion: 0,
        }),
      ).resolves.toMatchObject({ accountType: 'admin' });
    });
  });

  describe('UserService session bump hooks', () => {
    function createUserServiceWithUpdateMock(findByIdAndUpdate: jest.Mock): UserService {
      return new UserService(
        { findByIdAndUpdate } as never,
        {} as never,
        {} as AdminService,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
      );
    }

    it('updatePassword increments tokenVersion in Mongo', async () => {
      const exec = jest.fn().mockResolvedValue({});
      const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
      const userService = createUserServiceWithUpdateMock(findByIdAndUpdate);

      await userService.updatePassword(userId, 'hashed-password');

      expect(findByIdAndUpdate).toHaveBeenCalledWith(userId, {
        password: 'hashed-password',
        $inc: { tokenVersion: 1 },
      });
    });

    it('incrementTokenVersion uses atomic $inc', async () => {
      const exec = jest.fn().mockResolvedValue({ tokenVersion: 4 });
      const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
      const userService = createUserServiceWithUpdateMock(findByIdAndUpdate);

      await expect(userService.incrementTokenVersion(userId)).resolves.toBe(4);
      expect(findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $inc: { tokenVersion: 1 } },
        { new: true },
      );
    });
  });
});

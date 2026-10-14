import { PASSWORD_POLICY_MESSAGES } from '../../common/validators/password-policy';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  const adminService = {
    findByUserId: jest.fn().mockResolvedValue(null),
    findAuthorizationMirror: jest.fn().mockResolvedValue(null),
    deletePanelAdmin: jest.fn(),
    updatePanelAdmin: jest.fn(),
    createAdmin: jest.fn(),
  };

    beforeEach(() => {
    jest.clearAllMocks();
    service = new UserService(
      {} as never,
      {} as never,
      adminService as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns all unmet password rule messages while creating a user', async () => {
    await expect(
      service.createPanelUser({
        userid: 'EMP001',
        name: 'Test Employee',
        email: 'test.employee@example.com',
        password: 'abcdefgh',
        role: 'employee',
        department: 'Operations',
        permissions: {
          accessTabs: [],
          accessSubPages: {},
        },
      } as never),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          PASSWORD_POLICY_MESSAGES.uppercase,
          PASSWORD_POLICY_MESSAGES.number,
          PASSWORD_POLICY_MESSAGES.special,
        ]),
      },
    });
  });

  it('mirrors admin-directory profile fields onto a matching users row', async () => {
    const existing = {
      name: 'Old',
      email: 'old@example.com',
      set: jest.fn(),
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const findByUserId = jest
      .spyOn(service, 'findByUserId')
      .mockResolvedValue(existing as never);

    await service.syncPanelUserFromAdminDirectory({
      userid: 'rishi01',
      name: 'Rishi Edited',
      email: 'rishi@example.com',
      role: 'superadmin',
      firstName: 'Rishi',
      phone: '9999999999',
      stationAppAccess: { st1: ['fris'] },
    });

    expect(findByUserId).toHaveBeenCalledWith('rishi01');
    expect(existing.name).toBe('Rishi Edited');
    expect(existing.set).toHaveBeenCalledWith('firstName', 'Rishi');
    expect(existing.set).toHaveBeenCalledWith('phone', '9999999999');
    expect(existing.markModified).toHaveBeenCalledWith('stationAppAccess');
    expect(existing.save).toHaveBeenCalled();
    findByUserId.mockRestore();
  });

  it('removes the admin-directory mirror when a panel user is deleted', async () => {
    const user = {
      _id: 'user-1',
      userid: 'mgr01',
      employeeId: 'E-100',
      name: 'Manager One',
      email: 'mgr@example.com',
      role: 'manager',
      assignedStationIds: [],
    };
    const chain = (value: unknown) => ({
      exec: jest.fn().mockResolvedValue(value),
    });
    const userModel = {
      findById: jest.fn().mockReturnValue(chain(user)),
      findByIdAndUpdate: jest.fn().mockReturnValue(chain(user)),
      findByIdAndDelete: jest.fn().mockReturnValue(chain(user)),
    };
    const mirrorAdmin = {
      findAuthorizationMirror: jest.fn().mockResolvedValue({ _id: 'admin-1' }),
      deletePanelAdmin: jest.fn().mockResolvedValue({ success: true }),
    };
    const localService = new UserService(
      userModel as never,
      {} as never,
      mirrorAdmin as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await localService.deletePanelUser('user-1', {
      userId: 'actor-1',
      name: 'Actor',
    });

    expect(mirrorAdmin.deletePanelAdmin).toHaveBeenCalledWith('admin-1', {
      skipUserMirror: true,
    });
  });

  it('validates the trimmed password value that the backend stores', async () => {
    await expect(
      service.createPanelUser({
        userid: 'EMP001',
        name: 'Test Employee',
        email: 'test.employee@example.com',
        password: '  Abcd1!  ',
        role: 'employee',
        department: 'Operations',
        permissions: {
          accessTabs: [],
          accessSubPages: {},
        },
      } as never),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([PASSWORD_POLICY_MESSAGES.minLength]),
      },
    });
  });
});

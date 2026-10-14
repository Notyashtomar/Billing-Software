import {
  inviteUserHasNoStationBinding,
  isAdminPanelCrossStationAccess,
} from './admin-panel-station-scope';

describe('isAdminPanelCrossStationAccess', () => {
  it('returns false without a principal', () => {
    expect(isAdminPanelCrossStationAccess({})).toBe(false);
  });

  it('treats JWT global admin as cross-station', () => {
    expect(
      isAdminPanelCrossStationAccess({
        principal: {
          accountType: 'admin',
          isGlobalAdmin: true,
          userid: 'DELG0317',
          role: 'admin',
        },
      }),
    ).toBe(true);
  });

  it('treats admin-directory superadmin as cross-station even when flag is false', () => {
    expect(
      isAdminPanelCrossStationAccess({
        principal: {
          accountType: 'admin',
          isGlobalAdmin: false,
          userid: 'DELG0317',
          role: 'superadmin',
        },
        admin: { isGlobalAdmin: false, role: 'superadmin', userid: 'DELG0317' },
      }),
    ).toBe(true);
  });

  it('treats panel user authorizationRole superadmin as cross-station', () => {
    expect(
      isAdminPanelCrossStationAccess({
        principal: {
          accountType: 'admin',
          isGlobalAdmin: false,
          userid: 'DELG0317',
          role: 'admin',
        },
        user: {
          authorizationRole: 'superadmin',
          userid: 'DELG0317',
        },
      }),
    ).toBe(true);
  });

  it('keeps a station admin scoped', () => {
    expect(
      isAdminPanelCrossStationAccess({
        principal: {
          accountType: 'admin',
          isGlobalAdmin: false,
          userid: 'DELX0001',
          role: 'admin',
        },
        admin: { isGlobalAdmin: false, role: 'admin', userid: 'DELX0001' },
        user: { authorizationRole: 'admin', userid: 'DELX0001' },
      }),
    ).toBe(false);
  });
});

describe('inviteUserHasNoStationBinding', () => {
  it('is true when invite has neither assigned stations nor a label', () => {
    expect(
      inviteUserHasNoStationBinding({
        assignedStationIds: [],
        station: '',
      }),
    ).toBe(true);
  });

  it('is false when a station label exists', () => {
    expect(
      inviteUserHasNoStationBinding({
        assignedStationIds: [],
        station: 'DEL — Indira Gandhi International Airport',
      }),
    ).toBe(false);
  });
});

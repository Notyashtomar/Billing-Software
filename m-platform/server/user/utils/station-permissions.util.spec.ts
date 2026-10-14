import {
  buildFlagsForStationContext,
  buildStoredPermissionsFromInput,
  resolveFrisLandingPathFromAccessSubPages,
  resolveStationScopedPermissions,
} from './station-permissions.util';

describe('station-permissions.util', () => {
  const chennaiId = 'station-chennai';
  const delhiId = 'station-delhi';

  const stationPermissions = {
    [chennaiId]: {
      accessTabs: ['dashboard'],
      accessSubPages: {
        dashboard: ['Dashboard page'],
      },
    },
    [delhiId]: {
      accessTabs: ['creation'],
      accessSubPages: {
        creation: ['Scheduled Airlines'],
      },
    },
  };

  it('uses only the active station permissions at login', () => {
    const delhiScoped = resolveStationScopedPermissions({
      assignedStationIds: [chennaiId, delhiId],
      stationPermissions,
      permissions: {
        accessTabs: ['dashboard'],
        accessSubPages: { dashboard: ['Dashboard page'] },
      },
      stationId: delhiId,
    });

    expect(delhiScoped.accessTabs).toEqual(['creation']);
    expect(delhiScoped.accessSubPages).toEqual({
      creation: ['Scheduled Airlines'],
    });
  });

  it('does not inherit another station when the active station entry is missing', () => {
    const scoped = resolveStationScopedPermissions({
      assignedStationIds: [chennaiId, delhiId],
      stationPermissions: {
        [chennaiId]: stationPermissions[chennaiId],
      },
      permissions: {
        accessTabs: ['dashboard'],
        accessSubPages: { dashboard: ['Dashboard page'] },
      },
      stationId: delhiId,
    });

    expect(scoped.accessTabs).toEqual([]);
    expect(scoped.accessSubPages).toEqual({});
  });

  it('builds station-specific flags without dashboard for Delhi login', () => {
    const flags = buildFlagsForStationContext({
      assignedStationIds: [chennaiId, delhiId],
      stationPermissions,
      permissions: {
        accessTabs: ['dashboard'],
        accessSubPages: { dashboard: ['Dashboard page'] },
      },
      stationId: delhiId,
    });

    expect((flags.dashboard as Record<string, number>)['Dashboard page']).toBe(0);
    expect((flags.creation as Record<string, number>)['Scheduled Airlines']).toBe(1);
  });

  it('stores empty legacy permissions when multiple stations are assigned', () => {
    const stored = buildStoredPermissionsFromInput({
      assignedStationIds: [chennaiId, delhiId],
      stationPermissions,
      permissions: {
        accessTabs: ['dashboard'],
        accessSubPages: { dashboard: ['Dashboard page'] },
      },
    });

    expect(stored.permissions.accessTabs).toEqual([]);
    expect(stored.permissions.accessSubPages).toEqual({});
    expect(stored.stationPermissions[delhiId]?.accessSubPages).toEqual({
      creation: ['Scheduled Airlines'],
    });
  });

  it('mirrors single-station permissions into the station bucket on save', () => {
    const stored = buildStoredPermissionsFromInput({
      assignedStationIds: [chennaiId],
      stationPermissions: {},
      permissions: {
        accessTabs: ['flights'],
        accessSubPages: { flights: ['Scheduled Airlines'] },
      },
    });

    expect(stored.stationPermissions[chennaiId]?.accessSubPages).toEqual({
      flights: ['Scheduled Airlines'],
    });
    expect(
      (stored.flags.flights as Record<string, number>)['Scheduled Airlines'],
    ).toBe(1);
  });

  it('falls back to legacy global permissions for single-station login', () => {
    const scoped = resolveStationScopedPermissions({
      assignedStationIds: [chennaiId],
      stationPermissions: {},
      permissions: {
        accessTabs: ['flights'],
        accessSubPages: { flights: ['Scheduled Airlines'] },
      },
      stationId: chennaiId,
    });

    expect(scoped.accessSubPages).toEqual({
      flights: ['Scheduled Airlines'],
    });
  });

  it('does not inherit stale legacy dashboard when station buckets exist', () => {
    const scoped = resolveStationScopedPermissions({
      assignedStationIds: [chennaiId],
      stationPermissions: {
        [delhiId]: {
          accessTabs: ['flights'],
          accessSubPages: { flights: ['Scheduled Airlines'] },
        },
      },
      permissions: {
        accessTabs: ['dashboard'],
        accessSubPages: { dashboard: ['Dashboard page'] },
      },
      stationId: chennaiId,
    });

    expect(scoped.accessSubPages).toEqual({});
  });

  it('resolves landing path from flights-only station scope', () => {
    const path = resolveFrisLandingPathFromAccessSubPages({
      flights: ['Scheduled Airlines', 'Peak Flights'],
    });
    expect(path).toBe('/fris/flights/scheduledairlines');
  });
});

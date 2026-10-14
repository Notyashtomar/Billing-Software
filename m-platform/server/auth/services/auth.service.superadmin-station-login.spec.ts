/**
 * Panel users with authorizationRole=superadmin may resolve/login any station
 * (same gate as the universal portal id). Regular employees remain scoped to
 * assignedStationIds.
 */
describe('superadmin station login gate', () => {
  const delhiId = '6a27a8cc9678fc8ca81dbe5f';
  const chennaiId = '6a27a8cc9678fc8ca81dbe63';

  function resolveLoginStationAccess(input: {
    authorizationRole?: string;
    role?: string;
    isUniversal?: boolean;
    assignedStationIds: string[];
    requestedStationId?: string;
    resolvedFromCode?: string | null;
  }): { ok: boolean; stationId?: string; message?: string } {
    const panelAuthRole = String(
      input.authorizationRole ?? input.role ?? '',
    )
      .trim()
      .toLowerCase();
    const isPanelSuperadmin =
      input.isUniversal === true || panelAuthRole === 'superadmin';

    let requested = String(input.requestedStationId ?? '').trim();
    const assigned = input.assignedStationIds.map((id) => String(id).trim());

    if (requested && !assigned.includes(requested)) {
      const resolved = input.resolvedFromCode ?? null;
      if (resolved && (isPanelSuperadmin || assigned.includes(resolved))) {
        requested = resolved;
      }
    }

    if (isPanelSuperadmin) {
      return { ok: true, stationId: requested || assigned[0] || undefined };
    }

    if (!requested || !assigned.includes(requested)) {
      return {
        ok: false,
        message: 'You do not have access to this station.',
      };
    }
    return { ok: true, stationId: requested };
  }

  it('allows authorizationRole superadmin into unassigned DEL', () => {
    const result = resolveLoginStationAccess({
      authorizationRole: 'superadmin',
      role: 'employee',
      assignedStationIds: [chennaiId],
      requestedStationId: 'DEL',
      resolvedFromCode: delhiId,
    });
    expect(result).toEqual({ ok: true, stationId: delhiId });
  });

  it('rejects employee into unassigned DEL', () => {
    const result = resolveLoginStationAccess({
      authorizationRole: 'employee',
      assignedStationIds: [chennaiId],
      requestedStationId: 'DEL',
      resolvedFromCode: delhiId,
    });
    expect(result).toEqual({
      ok: false,
      message: 'You do not have access to this station.',
    });
  });

  it('allows employee into assigned DEL', () => {
    const result = resolveLoginStationAccess({
      authorizationRole: 'employee',
      assignedStationIds: [chennaiId, delhiId],
      requestedStationId: delhiId,
    });
    expect(result).toEqual({ ok: true, stationId: delhiId });
  });
});

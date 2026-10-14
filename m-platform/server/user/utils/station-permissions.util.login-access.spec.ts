import { validateUserStationLoginAccess } from './station-permissions.util';

describe('validateUserStationLoginAccess', () => {
  const delhiId = '674111111111111111111101';
  const chennaiId = '674111111111111111111102';

  it('allows login when requested station id is in assigned list', () => {
    const result = validateUserStationLoginAccess({
      assignedStationIds: [chennaiId, delhiId],
      stationId: delhiId,
    });
    expect(result).toEqual({ ok: true, stationId: delhiId });
  });

  it('rejects login when requested station id is not assigned', () => {
    const result = validateUserStationLoginAccess({
      assignedStationIds: [chennaiId],
      stationId: delhiId,
    });
    expect(result).toEqual({
      ok: false,
      message: 'You do not have access to this station.',
    });
  });

  it('auto-selects the only assigned station when none is requested', () => {
    const result = validateUserStationLoginAccess({
      assignedStationIds: [delhiId],
    });
    expect(result).toEqual({ ok: true, stationId: delhiId });
  });
});

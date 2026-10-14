import {
  scopeForGatewayRead,
  type StationScopeContext,
} from './station-scope';
import { TESTING_STATION_CODE } from './station.constants';

describe('scopeForGatewayRead', () => {
  it('opens gateway reads across stations for the testing station', () => {
    const ctx: StationScopeContext = {
      crossStation: false,
      stationCode: 'test',
    };
    expect(scopeForGatewayRead(ctx)).toEqual({
      crossStation: true,
      stationCode: TESTING_STATION_CODE,
    });
  });

  it('keeps a real station confined to itself', () => {
    const ctx: StationScopeContext = {
      crossStation: false,
      stationCode: 'DEL',
    };
    expect(scopeForGatewayRead(ctx)).toBe(ctx);
  });
});

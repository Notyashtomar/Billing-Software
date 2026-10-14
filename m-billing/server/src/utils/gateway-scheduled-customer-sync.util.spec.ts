import {
  extractScheduledAirlineCustomer,
  isScheduleSetupRowEnabled,
} from './gateway-scheduled-customer-sync.util';

describe('gateway scheduled customer sync', () => {
  it('extracts complete schedule customer fields', () => {
    expect(
      extractScheduledAirlineCustomer({
        airlineCode: 'ai',
        airline: 'Air India',
        flightNo: 'AI101',
        aircraft: 'A320',
      }),
    ).toEqual({
      customerCode: 'AI',
      name: 'Air India',
      flightNo: 'AI101',
      aircraftType: 'A320',
    });
  });

  it('does not invent a customer code when schedule code is missing', () => {
    expect(
      extractScheduledAirlineCustomer({
        airline: 'Air India',
        flightNo: 'AI101',
        aircraft: 'A320',
      }),
    ).toEqual({
      customerCode: '',
      name: 'Air India',
      flightNo: 'AI101',
      aircraftType: 'A320',
    });
  });

  it.each([
    [{ active: false }, false],
    [{ Active: 'No' }, false],
    [{ flightStatus: 'Cancelled' }, false],
    [{ isCancelled: true }, false],
    [{ active: true, flightStatus: 'Open' }, true],
    [{ airlineCode: 'AI' }, true],
  ])('identifies enabled schedule rows', (data, expected) => {
    expect(isScheduleSetupRowEnabled(data)).toBe(expected);
  });
});

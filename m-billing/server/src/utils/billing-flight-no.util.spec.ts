import { stripCancelledFlightPrefix } from './billing-flight-no.util';

describe('stripCancelledFlightPrefix', () => {
  it('keeps a normal flight number', () => {
    expect(stripCancelledFlightPrefix('IX472')).toBe('IX472');
    expect(stripCancelledFlightPrefix('IX2678')).toBe('IX2678');
  });

  it('removes a spaced or dashed CANC prefix', () => {
    expect(stripCancelledFlightPrefix('CANC IX472')).toBe('IX472');
    expect(stripCancelledFlightPrefix('CANC - IX472')).toBe('IX472');
    expect(stripCancelledFlightPrefix('CANC-IX472/IX473')).toBe('IX472/IX473');
  });

  it('removes a glued CANC prefix used on Cochin cancelled rows', () => {
    expect(stripCancelledFlightPrefix('CANCIX472')).toBe('IX472');
    expect(stripCancelledFlightPrefix('CANCIX472/CANCIX473')).toBe('IX472/IX473');
  });

  it('does not treat the word cancelled as a flight prefix', () => {
    expect(stripCancelledFlightPrefix('CANCELLED')).toBe('CANCELLED');
  });
});

import {
  compareContractsLatestFirst,
  pickLatestContract,
  pickPreferredHandlingContract,
} from './billing-contract-pick.util';

describe('billing-contract-pick.util', () => {
  it('prefers contract with later priceValidFrom', () => {
    const older = {
      _id: 'a',
      priceValidFrom: '2026-01-01',
      updatedAt: '2026-06-01',
    };
    const newer = {
      _id: 'b',
      priceValidFrom: '2026-04-01',
      updatedAt: '2026-05-01',
    };
    expect(pickLatestContract([older, newer])?._id).toBe('b');
    expect(compareContractsLatestFirst(older, newer)).toBeGreaterThan(0);
  });

  it('breaks ties on updatedAt when validity start matches', () => {
    const stale = {
      _id: 'a',
      priceValidFrom: '2026-01-01',
      updatedAt: '2026-03-01',
    };
    const edited = {
      _id: 'b',
      priceValidFrom: '2026-01-01',
      updatedAt: '2026-08-07',
    };
    expect(pickLatestContract([stale, edited])?._id).toBe('b');
  });

  it('prefers SGHA over cargo for passenger flights', () => {
    const cargo = {
      _id: 'c',
      contractNumber: 'CX-DEL-CARGO',
      priceValidFrom: '2025-05-16',
    };
    const sgha = {
      _id: 's',
      contractNumber: 'CX-DEL-SGHA',
      priceValidFrom: '2018-01-01',
    };
    expect(pickPreferredHandlingContract([cargo, sgha], false)?._id).toBe('s');
    expect(pickPreferredHandlingContract([cargo, sgha], true)?._id).toBe('c');
  });
});

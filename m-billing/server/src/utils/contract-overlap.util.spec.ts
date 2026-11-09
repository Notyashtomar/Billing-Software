import {
  contractScopesCollide,
  contractSectorsOf,
  describeContractOverlap,
  findOverlappingContracts,
} from './contract-overlap.util';

describe('contract overlap', () => {
  const base = {
    stationCode: 'MAA',
    customerCode: 'EY',
    status: 'active',
    priceValidFrom: '2026-01-01',
    priceValidTo: '2026-12-31',
  };

  it('derives sectors from categories, then legacy category, else everything', () => {
    expect([...contractSectorsOf({ categories: ['Dom'] })]).toEqual(['Dom']);
    expect([...contractSectorsOf({ category: 'Both' })]).toEqual(['Dom', 'Int']);
    expect([...contractSectorsOf({ category: 'Int' })]).toEqual(['Int']);
    expect(contractSectorsOf({}).size).toBe(4);
  });

  it('flags two active contracts for the same airline, sector and dates', () => {
    const a = { _id: '1', contractNumber: 'EY-MAA-SGHA', categories: ['Int'], ...base };
    const b = { _id: '2', contractNumber: 'EY-BAS-MAA-SGHA', categories: ['Int'], ...base };
    expect(findOverlappingContracts(a, [a, b]).map((row) => row._id)).toEqual(['2']);
    expect(describeContractOverlap(a, [b])).toContain('EY-BAS-MAA-SGHA');
  });

  it('allows different sectors, non-overlapping dates, cargo vs passenger, and inactive rows', () => {
    const intl = { _id: '1', contractNumber: 'EY-MAA-SGHA', categories: ['Int'], ...base };
    const dom = { _id: '2', contractNumber: 'EY-MAA-DOM', categories: ['Dom'], ...base };
    const later = {
      _id: '3',
      contractNumber: 'EY-MAA-SGHA-2027',
      categories: ['Int'],
      ...base,
      priceValidFrom: '2027-01-01',
      priceValidTo: '2027-12-31',
    };
    const cargo = { _id: '4', contractNumber: 'EY-MAA-CARGO', categories: ['Int'], ...base };
    const expired = { _id: '5', contractNumber: 'EY-OLD', categories: ['Int'], ...base, status: 'expired' };
    const otherStation = { _id: '6', contractNumber: 'EY-DEL', categories: ['Int'], ...base, stationCode: 'DEL' };
    expect(findOverlappingContracts(intl, [dom, later, cargo, expired, otherStation])).toEqual([]);
    expect(contractScopesCollide(intl, cargo)).toBe(false);
  });

  it('treats a contract without sectors as covering every sector', () => {
    const any = { _id: '1', contractNumber: 'EY-ANY', ...base };
    const dom = { _id: '2', contractNumber: 'EY-DOM', categories: ['Dom'], ...base };
    expect(findOverlappingContracts(dom, [any]).length).toBe(1);
  });
});

import {
  chandigarhBhsTerms,
  isChandigarhAdsLayout,
  isChandigarhBhsLayout,
  isChandigarhCompactFlow,
} from './invoice-pdf-chandigarh-bhs.util';

describe('invoice-pdf-chandigarh-bhs.util', () => {
  it('detects Chandigarh BHS invoices', () => {
    expect(isChandigarhBhsLayout({ serviceStation: 'CHANDIGARH', serviceCode: 'BHS' })).toBe(true);
    expect(isChandigarhBhsLayout({ serviceStation: 'IXC', serviceCode: 'Scheduled Flight' })).toBe(
      true,
    );
    expect(isChandigarhBhsLayout({ serviceStation: 'CHENNAI', serviceCode: 'BHS' })).toBe(false);
    expect(isChandigarhBhsLayout({ serviceStation: 'CHANDIGARH', serviceCode: 'ADS' })).toBe(false);
  });

  it('detects Chandigarh ADS invoices for compact page flow', () => {
    expect(isChandigarhAdsLayout({ serviceStation: 'IXC', serviceCode: 'ADS' })).toBe(true);
    expect(isChandigarhAdsLayout({ serviceStation: 'CHANDIGARH', serviceCode: 'EQUIPMENT' })).toBe(
      true,
    );
    expect(isChandigarhAdsLayout({ serviceStation: 'IXC', serviceCode: 'BHS' })).toBe(false);
    expect(isChandigarhAdsLayout({ serviceStation: 'MAA', serviceCode: 'ADS' })).toBe(false);
  });

  it('uses compact flow for Chandigarh BHS and ADS only', () => {
    expect(isChandigarhCompactFlow({ serviceStation: 'IXC', serviceCode: 'BHS' })).toBe(true);
    expect(isChandigarhCompactFlow({ serviceStation: 'IXC', serviceCode: 'ADS' })).toBe(true);
    expect(isChandigarhCompactFlow({ serviceStation: 'MAA', serviceCode: 'BHS' })).toBe(false);
  });

  it('builds the IXC BHS terms with the invoicing entity name', () => {
    const terms = chandigarhBhsTerms('BIRD AIRPORT SERVICES (MOHALI) PRIVATE LIMITED');
    expect(terms).toHaveLength(5);
    expect(terms[0]).toContain('Airport Operator');
    expect(terms[4]).toContain('BIRD AIRPORT SERVICES (MOHALI) PRIVATE LIMITED');
  });
});

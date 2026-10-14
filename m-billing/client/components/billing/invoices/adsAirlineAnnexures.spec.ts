// @ts-nocheck
import { invoiceShowsAirlineAnnexure } from './adsAirlineAnnexures';

describe('invoiceShowsAirlineAnnexure', () => {
  it('shows for ADS, BHS, Custom, and legacy blank category when the airline has files', () => {
    expect(invoiceShowsAirlineAnnexure('ADS', [], 'BI')).toBe(true);
    expect(invoiceShowsAirlineAnnexure('BHS', [], 'BI')).toBe(true);
    expect(invoiceShowsAirlineAnnexure('CUSTOM', [], 'BI')).toBe(true);
    expect(invoiceShowsAirlineAnnexure(undefined, [], 'BI')).toBe(true);
  });

  it('hides when the airline has no annexure pack', () => {
    expect(invoiceShowsAirlineAnnexure('BHS', [], '6E')).toBe(false);
    expect(invoiceShowsAirlineAnnexure('ADS', [], 'ZZ')).toBe(false);
  });

  it('does not show on RAF invoices', () => {
    expect(invoiceShowsAirlineAnnexure('RAF', [], 'BI')).toBe(false);
  });
});

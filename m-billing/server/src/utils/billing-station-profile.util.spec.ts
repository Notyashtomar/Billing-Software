import {
  formatStationLegalAddress,
  mergeBillingSettingsWithRegistry,
  panFromGstin,
  resolveBillingStationProfileDefaults,
} from './billing-station-profile.util';

describe('billing-station-profile.util', () => {
  it('maps Chandigarh (IXC) from the station legal registry', () => {
    const profile = resolveBillingStationProfileDefaults('IXC');
    expect(profile).not.toBeNull();
    expect(profile?.companyLegalEntity.name).toBe('Bird Airport Services (Mohali) Pvt. Ltd.');
    expect(profile?.companyLegalEntity.gstin).toBe('03AAJCB7598L1Z2');
    expect(profile?.companyLegalEntity.pan).toBe('AAJCB7598L');
    expect(profile?.gstStateCode).toBe('03');
    expect(profile?.companyLegalEntity.address).toContain('Chandigarh International Airport');
    expect(profile?.companyLegalEntity.address).toContain('140307');
  });

  it('maps Chennai (MAA) from the station legal registry', () => {
    const profile = resolveBillingStationProfileDefaults('MAA');
    expect(profile?.companyLegalEntity.gstin).toBe('33AALCB3911H1ZX');
    expect(profile?.gstStateCode).toBe('33');
  });

  it('returns null for an unknown station code', () => {
    expect(resolveBillingStationProfileDefaults('ZZZ')).toBeNull();
  });

  it('derives PAN from GSTIN', () => {
    expect(panFromGstin('03AAJCB7598L1Z2')).toBe('AAJCB7598L');
    expect(panFromGstin('')).toBe('');
  });

  it('formats the registered street, city and pincode', () => {
    expect(
      formatStationLegalAddress({
        street: 'Room no 5, Chandigarh International Airport',
        addressCity: 'Mohali, Punjab',
        pincode: '140307',
      }),
    ).toBe('Room no 5, Chandigarh International Airport, Mohali, Punjab - 140307');
  });

  it('fills only empty billing settings fields and preserves saved values', () => {
    const { merged, changed } = mergeBillingSettingsWithRegistry(
      {
        stationCode: 'IXC',
        approvalRequired: true,
        companyLegalEntity: { name: 'Custom Legal Name', gstin: '' },
      },
      'IXC',
    );
    expect(changed).toBe(true);
    expect(merged.companyLegalEntity?.name).toBe('Custom Legal Name');
    expect(merged.companyLegalEntity?.gstin).toBe('03AAJCB7598L1Z2');
    expect(merged.companyLegalEntity?.address).toContain('Chandigarh International Airport');
    expect(merged.gstStateCode).toBe('03');

    const second = mergeBillingSettingsWithRegistry(merged, 'IXC');
    expect(second.changed).toBe(false);
  });
});

import {
  formatParentCompanyAddress,
  resolveBillingCustomerAddress,
  resolveBillingCustomerInvoiceName,
} from './customer-address.util';

describe('formatParentCompanyAddress', () => {
  it('joins non-empty address lines', () => {
    expect(
      formatParentCompanyAddress({
        address: 'Link Building, Kamaraj Domestic terminal,',
        address2: 'Chennai Airport, Trisoolam, Chennai, Tamil Nadu',
        address3: '  ',
      }),
    ).toBe(
      'Link Building, Kamaraj Domestic terminal,\nChennai Airport, Trisoolam, Chennai, Tamil Nadu',
    );
  });

  it('returns undefined when every line is blank', () => {
    expect(formatParentCompanyAddress({ address: ' ', address2: '' })).toBeUndefined();
    expect(formatParentCompanyAddress(null)).toBeUndefined();
  });
});

describe('resolveBillingCustomerInvoiceName', () => {
  it('uses the airline invoice name when set', () => {
    expect(
      resolveBillingCustomerInvoiceName({
        name: 'SpiceJet',
        airlineInvoiceName: 'SpiceJet Limited',
      }),
    ).toBe('SpiceJet Limited');
  });

  it('falls back to the customer name', () => {
    expect(resolveBillingCustomerInvoiceName({ name: 'SpiceJet', airlineInvoiceName: '  ' })).toBe(
      'SpiceJet',
    );
  });
});

describe('resolveBillingCustomerAddress', () => {
  it('prefers address over the legacy dimension', () => {
    expect(
      resolveBillingCustomerAddress({
        address: 'Street 1',
        globalDimension2: 'Legacy',
      }),
    ).toBe('Street 1');
  });

  it('falls back to the legacy dimension', () => {
    expect(resolveBillingCustomerAddress({ globalDimension2: 'Legacy' })).toBe('Legacy');
  });

  it('stacks the second address under the first when the toggle is on', () => {
    expect(
      resolveBillingCustomerAddress({
        address: 'Terminal 3\nIGI Airport',
        secondaryAddressEnabled: true,
        secondaryAddress: 'Registered office\nNew Delhi',
      }),
    ).toBe('Terminal 3\nIGI Airport\nRegistered office\nNew Delhi');
  });

  it('ignores the second address when the toggle is off', () => {
    expect(
      resolveBillingCustomerAddress({
        address: 'Terminal 3',
        secondaryAddressEnabled: false,
        secondaryAddress: 'Registered office',
      }),
    ).toBe('Terminal 3');
  });
});

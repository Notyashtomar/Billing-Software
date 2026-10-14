import {
  commercialCustomerCode,
  shouldApplyUsdRoeToLineAmounts,
} from './billing-currency.util';

describe('commercialCustomerCode', () => {
  it('uses the primary contract customer for an additional code', () => {
    expect(
      commercialCustomerCode('MSF', {
        customerCode: 'MS',
        additionalCustomerCodes: ['MSF'],
      }),
    ).toBe('MS');
  });

  it('keeps the billed customer when they own the contract', () => {
    expect(
      commercialCustomerCode('MS', {
        customerCode: 'MS',
        additionalCustomerCodes: ['MSF'],
      }),
    ).toBe('MS');
  });
});

describe('shouldApplyUsdRoeToLineAmounts', () => {
  it('skips ROE division for USD-native prep rows', () => {
    expect(
      shouldApplyUsdRoeToLineAmounts('USD', 'BHS', [
        { rateMatch: { currency: 'USD' } },
      ]),
    ).toBe(false);
  });

  it('divides when prep rows are priced in INR', () => {
    expect(
      shouldApplyUsdRoeToLineAmounts('USD', 'BHS', [
        { rateMatch: { currency: 'INR' } },
      ]),
    ).toBe(true);
  });

  it('never divides custom invoices', () => {
    expect(shouldApplyUsdRoeToLineAmounts('USD', 'CUSTOM', [])).toBe(false);
  });
});

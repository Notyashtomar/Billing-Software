import {
  inheritForCustomer,
  normalizeAdditionalCustomerInherit,
  shapeContractForAdditionalCustomer,
} from './additional-customer-inherit.util';

describe('additional customer inherit', () => {
  const contract = {
    customerCode: 'MS',
    additionalCustomerCodes: ['APJ'],
    additionalCustomerInherit: [
      {
        customerCode: 'APJ',
        concessions: true,
        rateCards: false,
        contract: false,
        conversionRates: true,
        customer: false,
      },
    ],
    concessionRates: { dom: 5 },
    fortnightBillingEnabled: true,
    fortnightBillingMonthRates: [{ month: '2026-08', parts: [] }],
    adsBillingEnabled: true,
    adsEquipmentRules: [{ serviceCode: 'GPU' }],
  };

  it('keeps only the masters the user selected', () => {
    const flags = inheritForCustomer('APJ', contract);
    expect(flags.isAdditional).toBe(true);
    expect(flags.concessions).toBe(true);
    expect(flags.rateCards).toBe(false);

    const shaped = shapeContractForAdditionalCustomer(contract, 'APJ');
    expect(shaped?.concessionRates).toEqual({ dom: 5 });
    expect(shaped?.adsEquipmentRules).toEqual([]);
    expect(shaped?.fortnightBillingEnabled).toBe(true);
    expect(shaped?.fortnightBillingMonthRates).toEqual([{ month: '2026-08', parts: [] }]);
  });

  it('does not invent masters for an added airline with no saved choice', () => {
    const flags = inheritForCustomer('APJ', {
      ...contract,
      additionalCustomerInherit: [],
    });
    expect(flags.concessions).toBe(false);
    expect(flags.customer).toBe(false);
  });

  it('drops inherit rows for airlines no longer on the contract', () => {
    expect(
      normalizeAdditionalCustomerInherit('MS', ['APJ'], [
        { customerCode: 'APJ', concessions: true },
        { customerCode: 'XX', rateCards: true },
      ]),
    ).toEqual([
      {
        customerCode: 'APJ',
        concessions: true,
        rateCards: false,
        contract: false,
        conversionRates: false,
        customer: false,
      },
    ]);
  });
});

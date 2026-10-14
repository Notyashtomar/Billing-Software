import { lookupRafAdhocRate } from './raf-adhoc-lookup';

describe('lookupRafAdhocRate aliases', () => {
  const entries = [
    {
      label: 'Ground Power Unit (GPU) 140 KV',
      stationCode: '*',
      validFrom: new Date('2026-04-01'),
      validTo: new Date('2027-03-31'),
      unitPriceINR: 16784,
      unitPriceUSD: 220,
      uom: 'Per Hour',
    },
    {
      label: 'Push Back (Tow Bar included) Narrow Body',
      stationCode: '*',
      validFrom: new Date('2026-04-01'),
      validTo: new Date('2027-03-31'),
      unitPriceINR: 12588,
      unitPriceUSD: 165,
      uom: 'per service',
    },
  ];

  it('matches Excel short codes via aliases', () => {
    const hit = lookupRafAdhocRate('GPU-140KV', entries, {
      billingDate: new Date('2026-05-15'),
      domestic: true,
    });
    expect(hit?.unitPrice).toBe(16784);
    expect(hit?.uom).toBe('Per Hour');
  });

  it('uses the station price instead of the shared template', () => {
    const hit = lookupRafAdhocRate('GPU-140KV', [
      ...entries,
      {
        label: 'Ground Power Unit (GPU) 140 KV',
        stationCode: 'DEL',
        validFrom: new Date('2026-04-01'),
        validTo: new Date('2027-03-31'),
        unitPriceINR: 18000,
        unitPriceUSD: 240,
        uom: 'Per Hour',
      },
    ], {
      stationCode: 'DEL',
      billingDate: new Date('2026-05-15'),
      domestic: true,
    });
    expect(hit?.unitPrice).toBe(18000);

    const chennai = lookupRafAdhocRate('GPU-140KV', [
      ...entries,
      {
        label: 'Ground Power Unit (GPU) 140 KV',
        stationCode: 'DEL',
        validFrom: new Date('2026-04-01'),
        validTo: new Date('2027-03-31'),
        unitPriceINR: 18000,
        unitPriceUSD: 240,
        uom: 'Per Hour',
      },
    ], {
      stationCode: 'MAA',
      billingDate: new Date('2026-05-15'),
      domestic: true,
    });
    expect(chennai?.unitPrice).toBe(16784);
  });

  it('matches RAF catalog service codes', () => {
    const hit = lookupRafAdhocRate('RAF - Equipment - PBNB', entries, {
      billingDate: new Date('2026-05-15'),
      domestic: true,
    });
    expect(hit?.unitPrice).toBe(12588);
  });
});

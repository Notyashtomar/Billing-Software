import {
  pickBhsPackagePriceEntry,
  resolveBhsScheduledUnitPrice,
  selectBhsEntriesForFlightOperation,
} from './bhs-package-price.util';

describe('resolveBhsScheduledUnitPrice', () => {
  it('prefers BHS rate card USD over package D/E for USD airlines', () => {
    expect(
      resolveBhsScheduledUnitPrice({
        bhsPackagePrice: 765,
        unitPriceFromRateCard: 750,
        billingCurrency: 'USD',
      }),
    ).toEqual({ unitPrice: 750, pricingBasis: 'rate_card' });
  });

  it('keeps package D/E for INR airlines when set', () => {
    expect(
      resolveBhsScheduledUnitPrice({
        bhsPackagePrice: 21662,
        unitPriceFromRateCard: 20000,
        billingCurrency: 'INR',
      }),
    ).toEqual({ unitPrice: 21662, pricingBasis: 'bhs_package' });
  });

  it('falls back to rate card for INR when package missing', () => {
    expect(
      resolveBhsScheduledUnitPrice({
        unitPriceFromRateCard: 20000,
        billingCurrency: 'INR',
      }),
    ).toEqual({ unitPrice: 20000, pricingBasis: 'rate_card' });
  });

  it('matches Int flight to Dom-tagged B787 package', () => {
    const hit = pickBhsPackagePriceEntry(
      [{ aircraftType: 'B787-900', category: 'Dom', price: 180000, validFrom: '2026-01-20' }],
      'B787-900',
      'International',
    );
    expect(hit?.price).toBe(180000);
  });

  it('matches B737-800 to B737-DOM family package', () => {
    const hit = pickBhsPackagePriceEntry(
      [{ aircraftType: 'B737-DOM', category: 'Dom', price: 22000, validFrom: '2026-04-01' }],
      'B737-800',
      'International',
    );
    expect(hit?.price).toBe(22000);
  });

  it('keeps the widest opening comprehensive band when step bands are on the card', () => {
    const rows = [
      { aircraftType: 'Flight Per Month 1-400 (Comprehensive)', category: 'Dom', price: 20545, validFrom: '2026-06-01' },
      { aircraftType: 'Flight Per Month 1-500 (Comprehensive)', category: 'Dom', price: 25603, validFrom: '2026-06-01' },
      { aircraftType: 'Flight Per Month 501-600 (Comprehensive)', category: 'Dom', price: 24834, validFrom: '2026-06-01' },
      { aircraftType: 'Flight Per Month 601 and above (Comprehensive)', category: 'Dom', price: 24322, validFrom: '2026-06-01' },
      { aircraftType: 'Flight Per Month 1-500 (Ramp)', category: 'Dom', price: 20900, validFrom: '2026-06-01' },
      { aircraftType: 'Flight Per Month 1-150 (Comprehensive)', category: 'Int', price: 24140, validFrom: '2026-06-01' },
    ];
    expect(pickBhsPackagePriceEntry(rows, 'B737-800', 'Domestic')?.price).toBe(25603);
    expect(pickBhsPackagePriceEntry(rows, 'B737-800', 'International')?.price).toBe(24140);
  });

  it('prefers Dom 1-500 comprehensive when aircraft name is shared across band rows', () => {
    const rows = [
      {
        aircraftType: 'B737-800',
        category: 'Dom',
        price: 20545,
        validFrom: '2026-06-01',
        remarks: 'Comprehensive Handling Charges — Flight Per Month 1-400',
      },
      {
        aircraftType: 'B737-800',
        category: 'Dom',
        price: 25603,
        validFrom: '2026-06-01',
        remarks: 'Comprehensive Handling Charges — Flight Per Month 1-500',
      },
      {
        aircraftType: 'B737-800',
        category: 'Dom',
        price: 24834,
        validFrom: '2026-06-01',
        remarks: 'Comprehensive Handling Charges — Flight Per Month 501-600',
      },
      {
        aircraftType: 'B737-800',
        category: 'Dom',
        price: 20900,
        validFrom: '2026-06-01',
        remarks: 'Ramp Handling Charges — Flight Per Month 1-500',
      },
      {
        aircraftType: 'B737-800',
        category: 'Int',
        price: 24140,
        validFrom: '2026-06-01',
        remarks: 'Comprehensive Handling Charges — Flight Per Month 1-150',
      },
    ];
    expect(pickBhsPackagePriceEntry(rows, 'B737-800', 'Domestic')?.price).toBe(25603);
    expect(pickBhsPackagePriceEntry(rows, 'B737-800', 'International')?.price).toBe(24140);
  });

  it('uses flight-per-month handling band when no aircraft token matches', () => {
    const hit = pickBhsPackagePriceEntry(
      [
        { aircraftType: 'Pax Coach', category: 'Dom', price: 500, validFrom: '2026-06-01' },
        { aircraftType: 'Flight Per Month 1-500', category: 'Dom', price: 18500, validFrom: '2026-06-01' },
      ],
      'B737-800',
      'Domestic',
    );
    expect(hit?.price).toBe(18500);
  });

  it('prefers TRND/Turnaround over Transit/Technical freighter packages', () => {
    const rows = [
      {
        aircraftType: 'B777F',
        category: 'Int',
        price: 163994.81,
        validFrom: '2026-02-01',
        remarks: 'Tansit — Transit',
      },
      {
        aircraftType: 'B777F',
        category: 'Int',
        price: 204994.08,
        validFrom: '2026-02-01',
        remarks: 'TRND — B777F (TRND)',
      },
      {
        aircraftType: 'B777F',
        category: 'Int',
        price: 102497.6,
        validFrom: '2026-02-01',
        remarks: 'Technical — Technical',
      },
    ];
    expect(pickBhsPackagePriceEntry(rows, 'B777-200F', 'International-Cargo')?.price).toBe(
      204994.08,
    );
    expect(pickBhsPackagePriceEntry(rows, 'B777F', 'International')?.price).toBe(204994.08);
    expect(pickBhsPackagePriceEntry(rows, 'B77F', 'International')?.price).toBe(204994.08);
  });
});

describe('selectBhsEntriesForFlightOperation', () => {
  const rows = [
    { aircraftType: 'B777F', price: 100, flightOperation: 'scheduled' as const },
    { aircraftType: 'B777F', price: 80, flightOperation: 'additional' as const },
  ];

  it('uses the additional package for additional flights and keeps scheduled otherwise', () => {
    expect(selectBhsEntriesForFlightOperation(rows, true).map((row) => row.price)).toEqual([80]);
    expect(selectBhsEntriesForFlightOperation(rows, false).map((row) => row.price)).toEqual([100]);
  });

  it('falls back to the scheduled package when no additional card exists', () => {
    expect(
      selectBhsEntriesForFlightOperation([rows[0]], true).map((row) => row.price),
    ).toEqual([100]);
  });
});

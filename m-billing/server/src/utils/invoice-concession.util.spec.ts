import {
  EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT,
  calculateInvoiceConcessionFromLines,
  invalidateInvoiceContractCache,
  isOriginateOrTerminateFlight,
  resolveActiveContractForInvoice,
  resolveCeilingRatePerFlightInBillingCurrency,
  resolveLineAdditionalChargePercent,
  ferryKindFromFhrDocument,
  resolveLineConcessionPercent,
  roundBillingMoney,
  roundCeilingConcessionTotal,
  roundCeilingRatePerFlight,
} from './invoice-concession.util';

describe('exclusive BHS invoice concession', () => {
  const exclusiveContract = {
    bhsConcessionCoverage: 'non_comprehensive' as const,
    ceilingRatePerFlightINR: 38130,
  };

  it('converts INR ceiling to USD per flight using invoice currency factor', () => {
    const factor = 95.4509;
    const perFlightUsd = resolveCeilingRatePerFlightInBillingCurrency(
      { ceilingRatePerFlightINR: 38130 },
      'USD',
      factor,
    );
    expect(perFlightUsd).toBe(roundCeilingRatePerFlight(38130 / factor));

    const totals = calculateInvoiceConcessionFromLines(
      20_952,
      [
        {
          serviceCode: 'Scheduled Flight',
          quantity: 18,
          lineAmountExclTax: 20_952,
          sourceType: 'scheduled_flight',
        },
      ],
      {
        bhsConcessionCoverage: 'non_comprehensive',
        ceilingRatePerFlightINR: 38130,
      },
      { currencyCode: 'USD', currencyFactor: factor, scheduledFlightCount: 18 },
    );
    const ceilingTotal = roundCeilingConcessionTotal(perFlightUsd * 18);
    const eighteen = roundBillingMoney(20_952 * (EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT / 100));
    expect(totals.concessionFeeAmount).toBe(Math.max(ceilingTotal, eighteen));
    expect(ceilingTotal).toBeGreaterThan(eighteen);
  });

  it('uses the higher of 18% of flight total and ceiling × flight count', () => {
    const totals = calculateInvoiceConcessionFromLines(
      4_973_175,
      [
        {
          description: 'Charges for Turnaround Handling @ 160425',
          serviceCode: 'Scheduled Flight',
          quantity: 27,
          lineAmountExclTax: 4_331_475,
          sourceType: 'scheduled_flight',
        },
        {
          description: 'Charges for Turnaround Handling @ 160425',
          serviceCode: 'Scheduled Flight',
          quantity: 4,
          lineAmountExclTax: 641_700,
          sourceType: 'scheduled_flight',
        },
      ],
      exclusiveContract,
      { currencyCode: 'INR', scheduledFlightCount: 31 },
    );
    const eighteen = 4_973_175 * (EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT / 100);
    const ceiling = 38130 * 31;
    expect(eighteen).toBeLessThan(ceiling);
    expect(totals.concessionFeeAmount).toBe(ceiling);
    expect(totals.concessionFeePercent).toBe(0);
    expect(totals.grossAmount).toBe(4_973_175 + ceiling);
  });

  it('scales ceiling with the comprehensive charge percentage', () => {
    const packageRate = 160_425;
    const ceiling = 100_000;
    const totals = calculateInvoiceConcessionFromLines(
      packageRate * 0.5 * 2 + packageRate * 1.2,
      [
        {
          description: 'Charges for Technical Handling',
          serviceCode: 'Scheduled Flight',
          quantity: 2,
          unitPrice: packageRate * 0.5,
          lineAmountExclTax: packageRate * 0.5 * 2,
          sourceType: 'scheduled_flight',
          sourceRef: { bhsPackageRate: packageRate, concessionAppliedToUnitPrice: true, concessionPercent: 50 },
        },
        {
          description: 'Charges for Turnaround Handling',
          serviceCode: 'Scheduled Flight',
          quantity: 1,
          unitPrice: packageRate * 1.2,
          lineAmountExclTax: packageRate * 1.2,
          sourceType: 'scheduled_flight',
          sourceRef: { bhsPackageRate: packageRate, additionalChargePercent: 20 },
        },
      ],
      { bhsConcessionCoverage: 'non_comprehensive', ceilingRatePerFlightINR: ceiling },
      { currencyCode: 'INR', scheduledFlightCount: 3 },
    );
    const scaled = ceiling * 2 * 0.5 + ceiling * 1.2;
    expect(totals.concessionFeeAmount).toBe(roundCeilingConcessionTotal(scaled));
  });

  it('applies 18% when it exceeds the ceiling total', () => {
    const totals = calculateInvoiceConcessionFromLines(
      20_000,
      [
        {
          serviceCode: 'Scheduled Flight',
          quantity: 2,
          lineAmountExclTax: 20_000,
          sourceType: 'scheduled_flight',
        },
      ],
      {
        bhsConcessionCoverage: 'non_comprehensive',
        ceilingRatePerFlightINR: 500,
      },
      { currencyCode: 'INR' },
    );
    expect(totals.concessionFeeAmount).toBe(3600);
    expect(totals.concessionFeePercent).toBe(18);
    expect(totals.grossAmount).toBe(23_600);
  });

  it('uses 18/(100-18) when exclusive extended royalty is on', () => {
    const totals = calculateInvoiceConcessionFromLines(
      20_000,
      [
        {
          serviceCode: 'Scheduled Flight',
          quantity: 2,
          lineAmountExclTax: 20_000,
          sourceType: 'scheduled_flight',
        },
      ],
      {
        bhsConcessionCoverage: 'non_comprehensive',
        extendedRoyaltyEnabled: true,
        ceilingRatePerFlightINR: 500,
      },
      { currencyCode: 'INR' },
    );
    const extended = roundBillingMoney(20_000 * (18 / 82));
    expect(totals.concessionFeeAmount).toBe(extended);
    expect(totals.concessionFeePercent).toBe(18);
    expect(totals.grossAmount).toBe(roundBillingMoney(20_000 + extended));
  });

  it('ignores extended royalty unless pricing is exclusive', () => {
    const totals = calculateInvoiceConcessionFromLines(
      20_000,
      [
        {
          serviceCode: 'Scheduled Flight',
          quantity: 2,
          lineAmountExclTax: 20_000,
          sourceType: 'scheduled_flight',
        },
      ],
      {
        bhsConcessionCoverage: 'comprehensive',
        extendedRoyaltyEnabled: true,
        ceilingRatePerFlightINR: 500,
      },
      { currencyCode: 'INR' },
    );
    expect(totals.concessionFeeAmount).toBe(0);
    expect(totals.grossAmount).toBe(20_000);
  });

  it('adds no separate concession line for inclusive (comprehensive) contracts', () => {
    const totals = calculateInvoiceConcessionFromLines(
      20_000,
      [
        {
          serviceCode: 'Scheduled Flight',
          quantity: 2,
          lineAmountExclTax: 20_000,
          sourceType: 'scheduled_flight',
        },
      ],
      {
        bhsConcessionCoverage: 'comprehensive',
        ceilingRatePerFlightINR: 500,
        concessionRates: { int: 18 },
      },
      { currencyCode: 'INR' },
    );
    expect(totals.concessionFeeAmount).toBe(0);
    expect(totals.concessionFeePercent).toBe(0);
    expect(totals.grossAmount).toBe(20_000);
  });

  it('keeps additive percent + ceiling for non-exclusive contracts', () => {
    const totals = calculateInvoiceConcessionFromLines(
      20_000,
      [
        {
          serviceCode: 'Scheduled Flight',
          quantity: 2,
          lineAmountExclTax: 20_000,
          sourceType: 'scheduled_flight',
        },
      ],
      { ceilingRatePerFlightINR: 500 },
      { currencyCode: 'INR' },
    );
    expect(totals.concessionFeeAmount).toBe(1000);
    expect(totals.grossAmount).toBe(21_000);
  });
});

describe('originate / terminate BHS percent', () => {
  const contract = {
    conditionalCharges: { originateTerminatePercent: 50 },
  };

  it('treats ATA-only and ATD-only flights as partial handling', () => {
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: { operationalSnapshot: { ataTime: '10:15' } },
      }),
    ).toBe(true);
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: { operationalSnapshot: { atdTime: '18:40' } },
      }),
    ).toBe(true);
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: { operationalSnapshot: { ataTime: '10:15', atdTime: '18:40' } },
      }),
    ).toBe(false);
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: {
          operationalSnapshot: {
            TypeofHandling: 'Originate',
            ataTime: '10:15',
            atdTime: '12:00',
          },
        },
      }),
    ).toBe(true);
  });

  it('adds return-to-ramp percent on top of the comprehensive rate', () => {
    const line = {
      sourceRef: { operationalSnapshot: { returnToRamp: true, ataTime: '09:00', atdTime: '11:00' } },
    };
    const rtrContract = {
      conditionalCharges: { returnToRamp: 42, originateTerminatePercent: 50 },
    };
    expect(resolveLineConcessionPercent(line, rtrContract)).toBe(0);
    expect(resolveLineAdditionalChargePercent(line, rtrContract)).toBe(42);
  });

  it('charges the configured percent of the BHS package rate', () => {
    expect(
      resolveLineConcessionPercent(
        { sourceRef: { operationalSnapshot: { ataTime: '09:00' } } },
        contract,
      ),
    ).toBe(50);
    expect(
      resolveLineConcessionPercent(
        { sourceRef: { operationalSnapshot: { ataTime: '09:00', atdTime: '11:00' } } },
        contract,
      ),
    ).toBe(0);
    expect(
      resolveLineConcessionPercent(
        {
          sourceRef: {
            operationalSnapshot: { TypeofHandling: 'Terminate', ataTime: '09:00', atdTime: '11:00' },
          },
        },
        contract,
      ),
    ).toBe(50);
  });

  it('reads FHR departure as originate and arrival as terminate', () => {
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: {
          operationalSnapshot: {
            typeOfHandling: 'Scheduled',
            typeOfFlight: 'Departure',
            ataTime: '09:00',
            atdTime: '11:00',
          },
        },
      }),
    ).toBe(true);
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: {
          operationalSnapshot: {
            TypeofHandling: 'Turnaround',
            ops: 'Arrival',
            ataTime: '09:00',
            atdTime: '11:00',
          },
        },
      }),
    ).toBe(true);
    expect(
      resolveLineConcessionPercent(
        {
          sourceRef: {
            operationalSnapshot: {
              typeOfHandling: 'Scheduled',
              Typeofflight: 'Departure',
              ataTime: '09:00',
              atdTime: '11:00',
            },
          },
        },
        contract,
      ),
    ).toBe(50);
    expect(
      isOriginateOrTerminateFlight({
        sourceRef: {
          operationalSnapshot: {
            typeOfHandling: 'Turnaround',
            typeOfFlight: 'Turnaround',
            ataTime: '09:00',
            atdTime: '11:00',
          },
        },
      }),
    ).toBe(false);
  });
});

describe('resolveActiveContractForInvoice station lock', () => {
  const delhi = {
    _id: 'del-contract',
    stationCode: 'DEL',
    customerCode: 'AI',
    concessionRates: { dom: 18 },
    priceValidFrom: new Date('2026-01-01'),
    priceValidTo: new Date('2026-12-31'),
  };
  const chennai = {
    _id: 'maa-contract',
    stationCode: 'MAA',
    customerCode: 'AI',
    concessionRates: { dom: 15 },
    priceValidFrom: new Date('2026-01-01'),
    priceValidTo: new Date('2026-12-31'),
  };
  const docs = [delhi, chennai];

  function model() {
    return {
      findById(id: string) {
        return {
          lean: async () => docs.find((doc) => doc._id === id) ?? null,
        };
      },
      findOne(filter: { customerCode?: string; stationCode?: string }) {
        return {
          sort() {
            return {
              lean: async () =>
                docs.find(
                  (doc) =>
                    doc.customerCode === filter.customerCode &&
                    doc.stationCode === filter.stationCode,
                ) ?? null,
            };
          },
        };
      },
    };
  }

  beforeEach(() => invalidateInvoiceContractCache());

  it('keeps Chennai on 15% when the invoice still points at the Delhi contract', async () => {
    const resolved = await resolveActiveContractForInvoice(
      model() as never,
      { crossStation: true, stationCode: 'DEL' },
      {
        contractId: 'del-contract',
        customerCode: 'AI',
        documentDate: '2026-08-01',
        stationCode: 'MAA',
      },
    );
    expect(resolved?.stationCode).toBe('MAA');
    expect(resolved?.concessionRates?.dom).toBe(15);
  });

  it('does not pick Delhi when the session is unscoped and the invoice is Chennai', async () => {
    const resolved = await resolveActiveContractForInvoice(
      model() as never,
      { crossStation: true },
      {
        customerCode: 'AI',
        documentDate: '2026-08-01',
        stationCode: 'MAA',
      },
    );
    expect(resolved?.stationCode).toBe('MAA');
    expect(resolved?.concessionRates?.dom).toBe(15);
  });
});

describe('ferryKindFromFhrDocument', () => {
  it('reads FILO and LIFO from FHR handling text and from arrival versus departure pax', () => {
    expect(
      ferryKindFromFhrDocument({
        mainDetails: { TypeofHandling: 'Scheduled', Typeofflight: 'Ferry In/Load Out' },
      }),
    ).toBe('filo');
    expect(
      ferryKindFromFhrDocument({
        terminalDetails: { arrivalpax: 120, deppax: 0, Typeofflight: 'Load In/Ferry Out' },
      }),
    ).toBe('lifo');
    expect(
      ferryKindFromFhrDocument({
        terminalDetails: { arrivalpax: 0, deppax: 84 },
      }),
    ).toBe('filo');
    expect(
      ferryKindFromFhrDocument({
        mainDetails: { Typeofflight: 'Ferry In/Ferry Out' },
        terminalDetails: { arrivalpax: 0, deppax: 0 },
      }),
    ).toBeNull();
  });

  it('applies the FILO percent when the snapshot is stamped from FHR', () => {
    const percent = resolveLineConcessionPercent(
      { sourceRef: { operationalSnapshot: { ferryKind: 'filo', categoryOfFlight: 'Dom' } } },
      { concessionRates: { filoChargesPercent: 90, dom: 100 } },
    );
    expect(percent).toBe(90);
  });
});

import { Types } from 'mongoose';
import { InvoiceEngineService, splitBhsPreparationByUnitRate } from './invoice-engine.service';
import { calculateInvoiceConcessionFromLines } from '../utils/invoice-concession.util';

describe('InvoiceEngineService', () => {
  const taxEngine = {
    calculateLine: jest.fn(async (_ctx, input) => ({
      gstPercent: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      lineAmountInclTax: input.lineAmountExclTax,
    })),
  } as never;
  const currencyEngine = {
    resolveFactor: jest.fn(async () => 1),
  } as never;

  const emptyModel = {
    find: () => ({
      select: () => ({ lean: async () => [] }),
    }),
  } as never;
  const service = new InvoiceEngineService(taxEngine, currencyEngine, emptyModel, emptyModel);

  it('keeps full BHS rate for normal Dom flights (fee rates do not scale unit)', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      concessionRates: { int: 3, dom: 15 },
    } as never;
    const records = [
      {
        customerCode: 'IX',
        customerName: 'Air India Express',
        billingPeriodStart: new Date('2026-01-01'),
        billingPeriodEnd: new Date('2026-01-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo: '0' },
        operationalSnapshot: {
          categoryOfFlight: 'Dom',
          typeOfHandling: 'Normal',
          aircraftType: 'A320',
        },
        rateMatch: { serviceCode: 'BHS', unitPrice: 21662 },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-02-01'),
      'INR',
      contract,
    );

    expect(composed.lines[0].unitPrice).toBe(21662);
    expect(composed.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBeUndefined();
    expect(composed.lines[0].sourceRef?.concessionFeePercent).toBe(15);
  });

  it('adds the contract ceiling rate once per scheduled flight', async () => {
    const contract = {
      ceilingRatePerFlightINR: 500,
      ceilingRatePerFlightUSD: 8,
    } as never;
    const flight = (serialNo: string) => ({
      customerCode: 'QP',
      customerName: 'Akasa',
      billingPeriodStart: new Date('2026-08-01'),
      billingPeriodEnd: new Date('2026-08-31'),
      sourceType: 'scheduled_flight',
      sourceRef: { serialNo },
      operationalSnapshot: { categoryOfFlight: 'Domestic', aircraftType: 'B737' },
      rateMatch: { serviceCode: 'Scheduled Flight', unitPrice: 10000 },
    });

    const composed = await service.composeFromPreparation(
      {} as never,
      [flight('1'), flight('2')] as never,
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(composed.lines.some((line) => line.serviceCode === 'CEILING')).toBe(false);
    expect(composed.subtotalExclTax).toBe(20000);
    const totals = calculateInvoiceConcessionFromLines(
      composed.subtotalExclTax,
      composed.lines,
      contract,
      { currencyCode: 'INR' },
    );
    expect(totals.concessionFeePercent).toBe(0);
    expect(totals.concessionFeeAmount).toBe(1000);
    expect(totals.grossAmount).toBe(21000);
    expect(totals.subtotalExclTax).toBe(20000);
    const withStoredLine = calculateInvoiceConcessionFromLines(
      21000,
      [
        ...composed.lines,
        {
          serviceCode: 'CEILING',
          description: 'Ceiling rate',
          quantity: 2,
          lineAmountExclTax: 9999,
          sourceType: 'scheduled_flight',
          sourceRef: { ceilingRate: true },
        },
      ],
      contract,
      { currencyCode: 'INR' },
    );
    expect(withStoredLine.subtotalExclTax).toBe(20000);
    expect(withStoredLine.concessionFeeAmount).toBe(1000);
    expect(withStoredLine.grossAmount).toBe(21000);

    const airFrance = calculateInvoiceConcessionFromLines(
      4973175,
      [
        {
          description: 'Charges for Turnaround Handling @ 160425',
          serviceCode: 'Scheduled Flight',
          quantity: 27,
          lineAmountExclTax: 4331475,
        },
        {
          description: 'Charges for Turnaround Handling @ 160425',
          serviceCode: 'Scheduled Flight',
          quantity: 4,
          lineAmountExclTax: 641700,
        },
        {
          serviceCode: 'CEILING',
          description: 'Ceiling rate',
          quantity: 31,
          lineAmountExclTax: 1183673,
          sourceRef: { ceilingRate: true },
        },
      ],
      {
        ceilingRatePerFlightINR: 38130,
        bhsConcessionCoverage: 'non_comprehensive',
      },
      { currencyCode: 'INR', scheduledFlightCount: 31 },
    );
    expect(airFrance.subtotalExclTax).toBe(4973175);
    expect(airFrance.concessionFeeAmount).toBe(1182030);
    expect(airFrance.grossAmount).toBe(6155205);

    const usd = await service.composeFromPreparation(
      {} as never,
      [flight('1')] as never,
      new Date('2026-08-31'),
      'USD',
      contract,
    );
    expect(usd.lines.some((line) => line.serviceCode === 'CEILING')).toBe(false);
    const usdTotals = calculateInvoiceConcessionFromLines(
      usd.subtotalExclTax,
      usd.lines,
      contract,
      { currencyCode: 'USD' },
    );
    expect(usdTotals.concessionFeeAmount).toBe(8);
    expect(usdTotals.subtotalExclTax).toBe(10000);
  });

  it('applies contracts conditional diverted % to BHS unit price', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      concessionRates: { divertedDom: 3, int: 3 },
      conditionalCharges: { divertedDom: 50 },
    } as never;
    const records = [
      {
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-05-01'),
        billingPeriodEnd: new Date('2026-05-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo: '1' },
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          typeOfHandling: 'Additional',
          typeOfFlight: 'Diverted Flight',
          ops: 'Diverted Flight',
          aircraftType: 'B737-800',
        },
        rateMatch: { serviceCode: 'Scheduled Flight', unitPrice: 23500 },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-13'),
      'USD',
      contract,
    );

    expect(composed.lines[0].unitPrice).toBe(11750);
    expect(composed.lines[0].sourceRef?.bhsPackageRate).toBe(23500);
    expect(composed.lines[0].sourceRef?.concessionPercent).toBe(50);
    expect(composed.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBe(true);
    expect(composed.lines[0].sourceRef?.concessionFeePercent).toBe(3);
    expect(composed.lines[0].description).toBe('Charges for Diverted Flight handling');
  });

  it('does not use concessions-page divertedDom for unit scaling', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      concessionRates: { divertedDom: 3 },
    } as never;
    const records = [
      {
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-05-01'),
        billingPeriodEnd: new Date('2026-05-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo: '2' },
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          typeOfHandling: 'Additional',
          ops: 'Diverted Flight',
          aircraftType: 'B737-800',
        },
        rateMatch: { serviceCode: 'BHS', unitPrice: 23500 },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-13'),
      'USD',
      contract,
    );

    expect(composed.lines[0].unitPrice).toBe(23500);
    expect(composed.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBeUndefined();
    expect(composed.lines[0].sourceRef?.concessionFeePercent).toBe(3);
  });

  it('applies contracts conditional delay % to BHS unit price', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      concessionRates: { int: 3, dom: 15 },
      conditionalCharges: { delayChargesPercent: 50 },
    } as never;
    const records = [
      {
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-05-01'),
        billingPeriodEnd: new Date('2026-05-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo: '3' },
        operationalSnapshot: {
          categoryOfFlight: 'Dom',
          typeOfHandling: 'Normal',
          delayOnSta: '00:25:00',
          aircraftType: 'B737-800',
        },
        rateMatch: { serviceCode: 'BHS', unitPrice: 23500 },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-13'),
      'INR',
      contract,
    );

    expect(composed.lines[0].unitPrice).toBe(11750);
    expect(composed.lines[0].sourceRef?.concessionPercent).toBe(50);
    expect(composed.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBe(true);
    expect(composed.lines[0].sourceRef?.concessionFeePercent).toBe(15);
  });

  it('charges FILO and LIFO handling at the saved SGHA percent', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      concessionRates: { dom: 15 },
      conditionalCharges: { filoLifoChargesPercent: 75 },
    } as never;
    const row = (serialNo: string, typeOfHandling: string, extra?: Record<string, unknown>) =>
      ({
        customerCode: 'CA',
        customerName: 'Air China',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo },
        operationalSnapshot: {
          categoryOfFlight: 'Dom',
          typeOfHandling,
          aircraftType: 'A320',
          ...extra,
        },
        rateMatch: { serviceCode: 'BHS', unitPrice: 10000 },
      }) as never;

    const filo = await service.composeFromPreparation(
      {} as never,
      [row('1', 'FILO')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(filo.lines[0].unitPrice).toBe(7500);
    expect(filo.lines[0].sourceRef?.concessionPercent).toBe(75);
    expect(filo.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBe(true);

    const lifo = await service.composeFromPreparation(
      {} as never,
      [row('2', 'LIFO')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(lifo.lines[0].unitPrice).toBe(7500);

    const turnaround = await service.composeFromPreparation(
      {} as never,
      [row('3', 'Turnaround', { remarks: 'FILO LIFO note only' })],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(turnaround.lines[0].unitPrice).toBe(10000);
    expect(turnaround.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBeUndefined();

    const fifo = await service.composeFromPreparation(
      {} as never,
      [row('4', 'FIFO')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(fifo.lines[0].unitPrice).toBe(10000);

    const loadOut = await service.composeFromPreparation(
      {} as never,
      [row('5', 'Ferry in / Load out')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(loadOut.lines[0].unitPrice).toBe(7500);

    const loadIn = await service.composeFromPreparation(
      {} as never,
      [row('6', 'Load in / Ferry out')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(loadIn.lines[0].unitPrice).toBe(7500);
  });

  it('applies Akasa ferry replacement and additional ground, RON, and late-arrival percents', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      conditionalCharges: {
        filoChargesPercent: 60,
        lifoChargesPercent: 50,
        ronAdditionalPercent: 15,
        lateArrivalAdditionalPercent: 10,
        extraGroundTimeAdditionalPercent: 20,
      },
    } as never;
    const row = (serialNo: string, snapshot: Record<string, unknown>) =>
      ({
        customerCode: 'QP',
        customerName: 'Akasa',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo },
        operationalSnapshot: { aircraftType: 'B737', ...snapshot },
        rateMatch: { serviceCode: 'BHS', unitPrice: 10000 },
      }) as never;
    const price = async (snapshot: Record<string, unknown>) => {
      const composed = await service.composeFromPreparation(
        {} as never,
        [row('1', snapshot)],
        new Date('2026-08-31'),
        'INR',
        contract,
      );
      return composed.lines[0].unitPrice;
    };

    expect(await price({ categoryOfFlight: 'Dom', typeOfHandling: 'Ferry in Live out' })).toBe(6000);
    expect(await price({ categoryOfFlight: 'Dom', typeOfHandling: 'Live in Ferry out' })).toBe(5000);
    expect(await price({ categoryOfFlight: 'Dom', typeOfHandling: 'Ferry in Load out' })).toBe(6000);
    expect(await price({ categoryOfFlight: 'Dom', typeOfHandling: 'Load in Ferry out' })).toBe(5000);
    expect(
      await price({
        categoryOfFlight: 'Domestic',
        typeOfHandling: 'Turnaround',
        ataDate: '2026-08-01',
        ataTime: '23:10',
        atdDate: '2026-08-02',
        atdTime: '05:40',
      }),
    ).toBe(11500);
    expect(
      await price({
        categoryOfFlight: 'Domestic',
        typeOfHandling: 'Turnaround',
        ataDate: '2026-08-01',
        ataTime: '10:00',
        atdDate: '2026-08-01',
        atdTime: '12:00',
      }),
    ).toBe(12000);
    expect(
      await price({
        categoryOfFlight: 'Domestic-International',
        typeOfHandling: 'Turnaround',
        ataDate: '2026-08-01',
        ataTime: '10:00',
        atdDate: '2026-08-01',
        atdTime: '12:00',
      }),
    ).toBe(10000);
    expect(
      await price({
        categoryOfFlight: 'Domestic',
        typeOfHandling: 'Turnaround',
        staDate: '2026-08-01',
        staTime: '08:00',
        ataDate: '2026-08-01',
        ataTime: '10:00',
        atdDate: '2026-08-01',
        atdTime: '10:40',
      }),
    ).toBe(11000);
    expect(
      await price({
        categoryOfFlight: 'Domestic',
        typeOfHandling: 'Turnaround',
        ataDate: '2026-08-01T00:00:00.000Z',
        ataTime: '10:00',
        atdDate: '01/08/2026',
        atdTime: '12:30',
      }),
    ).toBe(12000);
    expect(
      await price({
        categoryOfFlight: 'Domestic',
        typeOfHandling: 'Turnaround',
        staDate: '2026-08-01',
        ataTime: '10:00',
        atdTime: '11:20',
      }),
    ).toBe(12000);
    const beyond = await service.composeFromPreparation(
      {} as never,
      [
        row('9', {
          categoryOfFlight: 'Domestic',
          typeOfHandling: 'Turnaround',
          ataDate: '2026-08-01',
          ataTime: '10:00',
          atdDate: '2026-08-01',
          atdTime: '12:00',
        }),
      ],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(beyond.lines[0].description).toContain('beyond 75 minutes ground time');
    expect(beyond.lines[0].unitPrice).toBe(12000);
  });

  it('ADS: applies per-flight free allowance then sums charged (Used vs Charged)', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-02-01'),
        billingPeriodEnd: new Date('2026-02-28'),
        sourceType: 'ads',
        sourceRef: { usageRowId: 'a1', flightNo: 'SG123' },
        operationalSnapshot: {
          aircraftType: 'B737-800',
          adsParticular: 'Wheel Chair -WCHR',
        },
        rateMatch: {
          serviceCode: 'Wheel Chair -WCHR',
          unitPrice: 850,
          usedUnits: 2,
          freeAllowance: 1,
          particular: 'Wheel Chair -WCHR',
          aircraftType: 'B737-800',
          uom: 'Per Service',
          pricingBasis: 'rate_card',
        },
      },
      {
        _id: new Types.ObjectId(),
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-02-01'),
        billingPeriodEnd: new Date('2026-02-28'),
        sourceType: 'equipment',
        sourceRef: { usageRowId: 'a2', flightNo: 'SG456' },
        operationalSnapshot: {
          aircraftType: 'B737-800',
          adsParticular: 'Wheel Chair -WCHR',
        },
        rateMatch: {
          serviceCode: 'Wheel Chair -WCHR',
          unitPrice: 850,
          usedUnits: 5,
          freeAllowance: 1,
          particular: 'Wheel Chair -WCHR',
          aircraftType: 'B737-800',
          uom: 'Per Service',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-03-03'),
      'INR',
    );

    // Flight1: max(0,2−1)=1; Flight2: max(0,5−1)=4 → charged 5 (not period pool 7−1).
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('Wheel Chair -WCHR');
    expect(composed.lines[0].quantity).toBe(5);
    expect(composed.lines[0].unitPrice).toBe(850);
    expect(composed.lines[0].lineAmountExclTax).toBe(4250);
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(7);
    expect(composed.lines[0].sourceRef?.chargedQuantity).toBe(5);
    expect(composed.lines[0].sourceType).toBe('ads');
    expect(composed.lines[0].serviceCode).toBe('ADS');
  });

  it('ADS: skips lines fully covered by free allowance per flight', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-02-01'),
        billingPeriodEnd: new Date('2026-02-28'),
        sourceType: 'ads',
        sourceRef: { usageRowId: 'b1' },
        operationalSnapshot: { aircraftType: 'Q-400' },
        rateMatch: {
          serviceCode: 'WCHR',
          unitPrice: 850,
          usedUnits: 5,
          freeAllowance: 5,
          particular: 'Wheel Chair -WCHR',
          aircraftType: 'Q-400',
          uom: 'Per Service',
        },
      },
    ] as never;

    await expect(
      service.composeFromPreparation({} as never, records, new Date('2026-03-03'), 'INR'),
    ).rejects.toThrow(/No billable invoice lines/);
  });

  it('ADS: uses adhoc/row unit price already resolved on rateMatch', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-02-01'),
        billingPeriodEnd: new Date('2026-02-28'),
        sourceType: 'manpower',
        sourceRef: { usageRowId: 'c1' },
        operationalSnapshot: { aircraftType: 'B737' },
        rateMatch: {
          serviceCode: 'Manpower (Blue collar)',
          unitPrice: 1755,
          usedUnits: 4,
          freeAllowance: 0,
          particular: 'Manpower (Blue collar)',
          aircraftType: 'B737',
          uom: 'Per personnel/hr',
          pricingBasis: 'adhoc',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-03-03'),
      'INR',
    );

    expect(composed.lines[0].quantity).toBe(4);
    expect(composed.lines[0].unitPrice).toBe(1755);
    expect(composed.lines[0].sourceRef?.pricingBasis).toBe('adhoc');
  });

  it('ADS: FHR-shaped row (serialNo + hourly LDL) aggregates Used/Charged', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'SG',
        customerName: 'Spicejet',
        billingPeriodStart: new Date('2026-04-01'),
        billingPeriodEnd: new Date('2026-04-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '17635', usageRowId: '17635:0', flightNo: 'SG123' },
        operationalSnapshot: {
          aircraftType: 'A330-200',
          adsParticular: 'Lower Deck Loader',
          usageHours: 2,
          qty: 1,
        },
        rateMatch: {
          serviceCode: 'ADS - Equipment - Lower Deck Loader',
          unitPrice: 23268,
          usedUnits: 2,
          freeAllowance: 0,
          particular: 'Lower Deck Loader',
          aircraftType: 'A330-200',
          uom: 'Per Hour',
          pricingBasis: 'adhoc',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-05-01'),
      'INR',
    );

    expect(composed.lines[0].quantity).toBe(2);
    expect(composed.lines[0].unitPrice).toBe(23268);
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(2);
    expect(composed.lines[0].sourceRef?.chargedQuantity).toBe(2);
  });

  it('ADS additional: never scales unit by BHS package conditionalCharges', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      concessionRates: { divertedDom: 3, dom: 15 },
      conditionalCharges: { divertedDom: 50 },
    } as never;
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        customerName: 'Air India Express',
        billingPeriodStart: new Date('2026-06-01'),
        billingPeriodEnd: new Date('2026-06-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '19714', usageRowId: '19714:0', flightNo: 'IX123' },
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          typeOfHandling: 'Additional',
          typeOfFlight: 'Diverted Flight',
          aircraftType: 'A320',
          adsParticular: 'GPU-NB',
        },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 12206,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'GPU-NB',
          aircraftType: 'A320',
          uom: 'Per Hour',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-01'),
      'INR',
      contract,
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].unitPrice).toBe(12206);
    expect(composed.lines[0].sourceRef?.concessionAppliedToUnitPrice).toBeFalsy();
    expect(composed.lines[0].sourceRef?.concessionFeePercent).toBe(3);
  });

  it('ADS: skips equipment not on airline contract', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        sourceType: 'ads',
        sourceRef: { usageRowId: 'x1' },
        operationalSnapshot: { adsParticular: 'LDL' },
        rateMatch: {
          serviceCode: 'LDL',
          unitPrice: 0,
          usedUnits: 2,
          freeAllowance: 0,
          particular: 'LDL',
          pricingBasis: 'not_on_contract',
        },
      },
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        sourceType: 'ads',
        sourceRef: { usageRowId: 'x2' },
        operationalSnapshot: { adsParticular: 'GPU-NB' },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 12206,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'GPU-NB',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-01'),
      'INR',
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('GPU-NB');
    expect(composed.lines[0].serviceCode).toBe('ADS');
    expect(composed.lines[0].unitPrice).toBe(12206);
  });

  it('ADS: bills from live contract when stale prep is package_inclusive', async () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['A320', 'TOILET SERVICE', 'PAX-COACH'],
      adsEquipmentRules: [
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          unitPriceINR: 8000,
          uom: 'Per Hour',
          aircraftTypes: ['TOILET SERVICE', 'A320'],
          effectiveMonth: '2026-08',
        },
      ],
    };
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'I5',
        customerName: 'AirAsia India',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'ads',
        sourceRef: { serialNo: '1', usageRowId: '1:0' },
        operationalSnapshot: {
          aircraftType: 'A320',
          equipment_name: 'GPU-90KV',
          billingDateYmd: '2026-08-10',
          adsParticular: 'GPU-90KV',
        },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 0,
          usedUnits: 2,
          freeAllowance: 0,
          particular: 'GPU-90KV',
          aircraftType: 'A320',
          uom: 'Per Hour',
          pricingBasis: 'package_inclusive',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-08-01'),
      'INR',
      contract,
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].unitPrice).toBe(8000);
    expect(composed.lines[0].quantity).toBe(2);
  });

  it('ADS: leaves BME equipment off the invoice unless the contract toggle is on', async () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['A320'],
      adsEquipmentRules: [
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          unitPriceINR: 8000,
          uom: 'Per Service',
          aircraftTypes: ['A320'],
          effectiveMonth: '2026-09',
        },
      ],
    };
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'VS',
        customerName: 'Virgin Atlantic',
        billingPeriodStart: new Date('2026-09-01'),
        billingPeriodEnd: new Date('2026-09-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '1', usageRowId: '1:gpu-bme' },
        operationalSnapshot: {
          aircraftType: 'A320',
          equipment_name: 'Ground Power Unit (BME)',
          billingDateYmd: '2026-09-10',
          adsParticular: 'Ground Power Unit (BME)',
        },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 8000,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'Ground Power Unit (BME)',
          aircraftType: 'A320',
          uom: 'Per Service',
          pricingBasis: 'rate_card',
        },
      },
      {
        _id: new Types.ObjectId(),
        customerCode: 'VS',
        customerName: 'Virgin Atlantic',
        billingPeriodStart: new Date('2026-09-01'),
        billingPeriodEnd: new Date('2026-09-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '1', usageRowId: '1:gpu-140' },
        operationalSnapshot: {
          aircraftType: 'A320',
          equipment_name: 'Ground Power Unit - 140KV',
          billingDateYmd: '2026-09-10',
          adsParticular: 'Ground Power Unit - 140KV',
        },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 8000,
          usedUnits: 2,
          freeAllowance: 0,
          particular: 'Ground Power Unit - 140KV',
          aircraftType: 'A320',
          uom: 'Per Service',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const excluded = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-09-01'),
      'INR',
      contract,
    );
    expect(excluded.lines.map((line) => line.description)).toEqual([
      'Ground Power Unit - 140KV',
    ]);

    const included = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-09-01'),
      'INR',
      { ...contract, billBmeEquipment: true },
    );
    expect(included.lines.map((line) => line.description).sort()).toEqual([
      'Ground Power Unit (BME)',
      'Ground Power Unit - 140KV',
    ]);
  });

  it('ADS: applies July contract rules when STA is DD/MM/YYYY', async () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['B738'],
      adsEquipmentRules: [
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          unitPriceINR: 100,
          uom: 'Per Hour',
          aircraftTypes: ['B738'],
          effectiveMonth: '2026-06',
        },
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          unitPriceINR: 200,
          uom: 'Per Hour',
          aircraftTypes: ['B738'],
          effectiveMonth: '2026-07',
        },
      ],
    };
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        customerName: 'Air India Express',
        billingPeriodStart: new Date('2026-07-01'),
        billingPeriodEnd: new Date('2026-07-31'),
        sourceType: 'ads',
        sourceRef: { serialNo: '1', usageRowId: '1:0' },
        operationalSnapshot: {
          aircraftType: 'B738',
          equipment_name: 'GPU-90KV',
          staDate: '15/07/2026',
          billingDateYmd: '2026-07-15',
          adsParticular: 'Ground Power Unit -90KV',
        },
        rateMatch: {
          serviceCode: 'ADS - Equipment - Ground Power Unit -90KV',
          unitPrice: 200,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'Ground Power Unit -90KV',
          aircraftType: 'B738',
          uom: 'Per Hour',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-01'),
      'INR',
      contract,
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].unitPrice).toBe(200);
  });

  it('ADS: derives July effective month from DD/MM/YYYY STA only', async () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['B738'],
      adsEquipmentRules: [
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          unitPriceINR: 200,
          uom: 'Per Hour',
          aircraftTypes: ['B738'],
          effectiveMonth: '2026-07',
        },
      ],
    };
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        sourceType: 'ads',
        sourceRef: { serialNo: '2', usageRowId: '2:0' },
        operationalSnapshot: {
          aircraftType: 'B738',
          equipment_name: 'GPU-90KV',
          staDate: '15/07/2026',
          adsParticular: 'Ground Power Unit -90KV',
        },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 200,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'Ground Power Unit -90KV',
          aircraftType: 'B738',
          uom: 'Per Hour',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-01'),
      'INR',
      contract,
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].unitPrice).toBe(200);
  });

  it('ADS: skips Cones when contract explicitly excludes it (Included-for-ADS off)', async () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['A320'],
      adsEquipmentRules: [
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          unitPriceINR: 2146,
          uom: 'Per Hour',
          aircraftTypes: ['A320'],
        },
        {
          // Explicit exclusion — the correct way to guarantee an item never bills.
          serviceCode: 'Cones',
          includedForAds: false,
          aircraftTypes: ['A320'],
        },
      ],
    };
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        customerName: 'Air India Express',
        billingPeriodStart: new Date('2026-06-01'),
        billingPeriodEnd: new Date('2026-06-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '1', usageRowId: '1:0' },
        operationalSnapshot: {
          aircraftType: 'A320',
          equipment_name: 'C',
          adsParticular: 'Cones',
        },
        rateMatch: {
          serviceCode: 'ADS - Equipment - Cones',
          unitPrice: 2146,
          usedUnits: 10,
          freeAllowance: 0,
          particular: 'Cones',
          aircraftType: 'A320',
          uom: 'Per Hour',
          pricingBasis: 'rate_card',
        },
      },
      {
        _id: new Types.ObjectId(),
        customerCode: 'IX',
        customerName: 'Air India Express',
        billingPeriodStart: new Date('2026-06-01'),
        billingPeriodEnd: new Date('2026-06-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '2', usageRowId: '2:0' },
        operationalSnapshot: {
          aircraftType: 'A320',
          equipment_name: 'GPU-90KV',
          adsParticular: 'GPU-NB',
        },
        rateMatch: {
          serviceCode: 'ADS - Equipment - GPU-NB',
          unitPrice: 2146,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'GPU-NB',
          aircraftType: 'A320',
          uom: 'Per Hour',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-01'),
      'INR',
      contract,
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('GPU-NB');
    expect(composed.lines[0].serviceCode).toBe('ADS');
    expect(composed.lines.some((l) => /cones/i.test(l.description))).toBe(false);
  });

  it('ADS: live contract free-per-flight overrides stale prep freeAllowance', async () => {
    // Contract now gives 1 free pushback/flight. Prep records are stale (free=0),
    // so before the fix every use billed (the "33 pushbacks" bug).
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['A320'],
      adsEquipmentRules: [
        {
          serviceCode: 'PBNB',
          includedForAds: true,
          freePerFlight: 1,
          unitPriceINR: 5000,
          uom: 'EA',
          aircraftTypes: ['A320'],
        },
      ],
    };
    const mkRecord = (serial: string, usedUnits: number) => ({
      _id: new Types.ObjectId(),
      customerCode: 'GF',
      customerName: 'Gulf Air',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-06-30'),
      sourceType: 'ads',
      sourceRef: { serialNo: serial, usageRowId: `${serial}:0` },
      operationalSnapshot: {
        aircraftType: 'A320',
        equipment_name: 'PBNB',
        adsParticular: 'PBNB',
      },
      rateMatch: {
        serviceCode: 'PBNB',
        unitPrice: 5000,
        usedUnits,
        freeAllowance: 0, // stale prep — free not yet applied
        particular: 'PBNB',
        aircraftType: 'A320',
        uom: 'EA',
        pricingBasis: 'rate_card',
      },
    });
    // Three flights use exactly 1 pushback (all free), one flight uses 2 (bills 1).
    const records = [
      mkRecord('1', 1),
      mkRecord('2', 1),
      mkRecord('3', 1),
      mkRecord('4', 2),
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-07-01'),
      'INR',
      contract,
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('PBNB');
    expect(composed.lines[0].serviceCode).toBe('ADS');
    // used across flights = 1+1+1+2 = 5; free 1/flight → only the 2-use flight bills 1.
    expect(composed.lines[0].quantity).toBe(1);
    expect(composed.lines[0].sourceRef?.chargedQuantity).toBe(1);
  });

  it('ADS: free count is once per flight when FHR has several lines of the same equipment', async () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['A320'],
      adsEquipmentRules: [
        {
          serviceCode: 'WCHR',
          includedForAds: true,
          freePerFlight: 1,
          unitPriceINR: 1050,
          uom: 'Per Usage',
          aircraftTypes: ['A320'],
        },
      ],
    };
    const line = (usageRowId: string, qty: number) => ({
      _id: new Types.ObjectId(),
      customerCode: 'TG',
      customerName: 'Thai',
      billingPeriodStart: new Date('2026-09-01'),
      billingPeriodEnd: new Date('2026-09-30'),
      sourceType: 'ads',
      sourceRef: { serialNo: '9001', usageRowId, flightNo: 'TG315' },
      operationalSnapshot: {
        aircraftType: 'A320',
        equipment_name: 'Wheel Chair - WCHR',
        adsParticular: 'Wheel Chair - WCHR',
        qty,
        serialNumber: '9001',
      },
      rateMatch: {
        serviceCode: 'WCHR',
        unitPrice: 1050,
        usedUnits: qty,
        freeAllowance: 0,
        particular: 'Wheel Chair - WCHR',
        aircraftType: 'A320',
        uom: 'Per Usage',
        pricingBasis: 'rate_card',
      },
    });
    const composed = await service.composeFromPreparation(
      {} as never,
      [line('9001:0', 1), line('9001:1', 1)] as never,
      new Date('2026-10-01'),
      'INR',
      contract,
    );
    // Two uses on one flight, one free → one chargeable × 1050.
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].quantity).toBe(1);
    expect(composed.lines[0].unitPrice).toBe(1050);
    expect(composed.lines[0].lineAmountExclTax).toBe(1050);
    expect(composed.lines[0].uom).toBe('Per Usage');
  });

  it('ADS: equipment on an aircraft that is not on the contract rule is not billed', async () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          freePerFlight: 0,
          unitPriceINR: 9500,
          uom: 'Per Hour',
          aircraftTypes: ['A320'],
        },
      ],
    };
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'TG',
        customerName: 'Thai',
        billingPeriodStart: new Date('2026-09-01'),
        billingPeriodEnd: new Date('2026-09-30'),
        sourceType: 'ads',
        sourceRef: { serialNo: '44', usageRowId: '44:0' },
        operationalSnapshot: {
          aircraftType: 'A330',
          equipment_name: 'GPU-NB',
          qty: 1,
          usageHours: 1,
        },
        rateMatch: {
          serviceCode: 'GPU-NB',
          unitPrice: 9500,
          usedUnits: 1,
          freeAllowance: 0,
          particular: 'GPU-NB',
          aircraftType: 'A330',
          uom: 'Per Hour',
          pricingBasis: 'rate_card',
        },
      },
    ] as never;
    await expect(
      service.composeFromPreparation(
        {} as never,
        records,
        new Date('2026-10-01'),
        'INR',
        contract,
      ),
    ).rejects.toThrow(/No billable invoice lines/);
  });

  it('ADS: turnaround Crew Coach charges at most 1 per flight (ARR+DEP lines)', async () => {
    const mkCrew = (usageRowId: string, remarks: string) => ({
      _id: new Types.ObjectId(),
      customerCode: 'IX',
      customerName: 'Air India Express',
      billingPeriodStart: new Date('2026-07-01'),
      billingPeriodEnd: new Date('2026-07-31'),
      sourceType: 'equipment',
      sourceRef: {
        serialNo: '19993',
        usageRowId,
        flightNo: 'IX2007/2661',
      },
      operationalSnapshot: {
        aircraftType: 'B738',
        adsParticular: 'Crew Coach',
        particular: 'Crew Coach',
        equipment_name: 'Crew-Coach-1',
        flightNo: 'IX2007/2661',
        typeOfHandling: 'Turnaround',
        remarks,
        serialNumber: '19993',
      },
      rateMatch: {
        serviceCode: 'Crew Coach',
        unitPrice: 3357,
        usedUnits: 1,
        freeAllowance: 0,
        particular: 'Crew Coach',
        aircraftType: 'B738',
        uom: 'Per Trip',
        pricingBasis: 'rate_card',
      },
    });

    const records = [
      mkCrew('19993:0', '00:35 ARR 01 TRIP'),
      mkCrew('19993:1', '00:35 DEP 01 TRIP'),
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-08-01'),
      'INR',
    );

    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('Crew Coach');
    expect(composed.lines[0].quantity).toBe(1);
    expect(composed.lines[0].sourceRef?.chargedQuantity).toBe(1);
  });

  it('composes RAF lines with Service Code RAF and sums hourly usedUnits', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: 'MAN',
        customerName: 'MANAH',
        billingPeriodStart: new Date('2026-03-01'),
        billingPeriodEnd: new Date('2026-07-31'),
        sourceType: 'raf',
        sourceRef: { serialNo: '1' },
        operationalSnapshot: {
          particular: 'Floor Walkers/Welcome staff',
          aircraftType: 'Cessna CJ2+',
          uom: 'per personnel/hr',
          usageHours: 1.5,
        },
        rateMatch: {
          particular: 'Floor Walkers/Welcome staff',
          aircraftType: 'Cessna CJ2+',
          unitPrice: 1678,
          uom: 'per personnel/hr',
          usedUnits: 1.5,
          matched: true,
        },
      },
      {
        _id: new Types.ObjectId(),
        customerCode: 'MAN',
        customerName: 'MANAH',
        billingPeriodStart: new Date('2026-03-01'),
        billingPeriodEnd: new Date('2026-07-31'),
        sourceType: 'raf',
        sourceRef: { serialNo: '2' },
        operationalSnapshot: {
          particular: 'Ramp to Flight Deck Communication- Narrow Body',
          aircraftType: 'Embraer 135 BJ',
          uom: 'Per Turnaround',
        },
        rateMatch: {
          particular: 'Ramp to Flight Deck Communication- Narrow Body',
          aircraftType: 'Embraer 135 BJ',
          unitPrice: 5340,
          uom: 'Per Turnaround',
          usedUnits: 0.1667,
          matched: true,
        },
      },
      {
        _id: new Types.ObjectId(),
        customerCode: 'MAN',
        customerName: 'MANAH',
        billingPeriodStart: new Date('2026-03-01'),
        billingPeriodEnd: new Date('2026-07-31'),
        sourceType: 'raf',
        sourceRef: { serialNo: '3' },
        operationalSnapshot: {
          particular: 'Ramp to Flight Deck Communication- Narrow Body',
          aircraftType: 'Embraer 135 BJ',
          uom: 'Per Turnaround',
        },
        rateMatch: {
          particular: 'Ramp to Flight Deck Communication- Narrow Body',
          aircraftType: 'Embraer 135 BJ',
          unitPrice: 5340,
          uom: 'Per Turnaround',
          usedUnits: 0.2,
          matched: true,
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-08-01'),
      'INR',
    );

    expect(composed.invoiceCategory).toBe('RAF');
    expect(composed.lines).toHaveLength(2);
    const floor = composed.lines.find((l) => l.description.includes('Floor'));
    const ramp = composed.lines.find((l) => l.description.includes('Ramp'));
    expect(floor?.quantity).toBe(1.5);
    expect(floor?.serviceCode).toBe('RAF');
    expect(floor?.sourceRef?.pricingBasis).toBe('adhoc');
    expect(ramp?.quantity).toBe(2);
    expect(ramp?.serviceCode).toBe('RAF');
  });

  it('RAF: keeps unpriced particulars so draft can accept custom / adhoc rates', async () => {
    const records = [
      {
        _id: new Types.ObjectId(),
        customerCode: '6E',
        customerName: 'IndiGo',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'raf',
        sourceRef: { serialNo: '9' },
        operationalSnapshot: {
          particular: 'Custom toilet cart',
          uom: 'per personnel/hr',
          usageHours: 3,
        },
        rateMatch: {
          particular: 'Custom toilet cart',
          unitPrice: 0,
          uom: 'per personnel/hr',
          usedUnits: 3,
        },
      },
    ] as never;

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-08-01'),
      'INR',
    );

    expect(composed.invoiceCategory).toBe('RAF');
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].unitPrice).toBe(0);
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(3);
    expect(composed.lines[0].sourceRef?.pricingBasis).toBe('pending');
  });

  it('replaces the saved comprehensive rate with stepwise bands and adds RON on that band', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      conditionalCharges: { ronAdditionalPercent: 15 },
      bhsVolumeSchedules: [
        {
          chargeKind: 'comprehensive' as const,
          flightScope: 'domestic_t1' as const,
          allocation: 'marginal' as const,
          overridesSavedRate: true,
          effectiveFrom: '2026-06-01',
          effectiveTo: '2027-05-31',
          bands: [
            { fromCount: 1, toCount: 2, unitPriceINR: 10000 },
            { fromCount: 3, toCount: null, unitPriceINR: 8000 },
          ],
        },
      ],
    };
    const row = (
      serialNo: string,
      staTime: string,
      snapshot: Record<string, unknown> = {},
    ) =>
      ({
        customerCode: 'QP',
        customerName: 'Akasa',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo, flightNo: serialNo },
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          terminal: 'T1',
          typeOfHandling: 'Turnaround',
          aircraftType: 'B737',
          staDate: '2026-08-02',
          staTime,
          ...snapshot,
        },
        rateMatch: { serviceCode: 'BHS', unitPrice: 21662 },
      }) as never;

    const records = [
      row('1', '06:00'),
      row('2', '08:00'),
      row('3', '23:00', {
        ataDate: '2026-08-02',
        ataTime: '23:10',
        atdDate: '2026-08-03',
        atdTime: '05:40',
      }),
    ];

    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    const byPrice = new Map(composed.lines.map((line) => [line.unitPrice, line]));
    expect(byPrice.get(10000)?.quantity).toBe(2);
    expect(byPrice.get(10000)?.sourceRef?.bhsVolumeOverride).toBe(true);
    expect(byPrice.get(10000)?.sourceRef?.savedComprehensiveRate).toBe(21662);
    expect(byPrice.get(9200)?.quantity).toBe(1);
    expect(byPrice.get(9200)?.sourceRef?.additionalChargePercent).toBe(15);

    const partial = await service.composeFromPreparation(
      {} as never,
      [records[2]],
      new Date('2026-08-31'),
      'INR',
      contract,
      { volumePopulation: records },
    );
    expect(partial.lines[0].unitPrice).toBe(9200);

    const usd = await service.composeFromPreparation(
      {} as never,
      [records[0]],
      new Date('2026-08-31'),
      'USD',
      contract,
    );
    expect(usd.lines[0].unitPrice).toBe(21662);
  });

  it('adds Delhi split-turnaround uplift on the domestic or international comprehensive rate', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      conditionalCharges: {
        splitIntArrivalDomDeparturePercent: 20,
        splitDomArrivalIntDeparturePercent: 25,
      },
      bhsVolumeSchedules: [
        {
          chargeKind: 'comprehensive' as const,
          flightScope: 'domestic_t1' as const,
          allocation: 'flat' as const,
          overridesSavedRate: true,
          bands: [{ fromCount: 1, toCount: null, unitPriceINR: 10000 }],
        },
        {
          chargeKind: 'comprehensive' as const,
          flightScope: 'international' as const,
          allocation: 'flat' as const,
          overridesSavedRate: true,
          bands: [{ fromCount: 1, toCount: null, unitPriceINR: 20000 }],
        },
      ],
    };
    const row = (category: string, stationCode = 'DEL') =>
      ({
        customerCode: 'QP',
        customerName: 'Akasa',
        stationCode,
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo: category },
        operationalSnapshot: {
          categoryOfFlight: category,
          terminal: 'T1',
          aircraftType: 'B737',
        },
        rateMatch: { serviceCode: 'Scheduled Flight', unitPrice: 1 },
      }) as never;

    const intArrival = await service.composeFromPreparation(
      {} as never,
      [row('International-Domestic')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(intArrival.lines[0].unitPrice).toBe(12000);
    expect(intArrival.lines[0].sourceRef?.splitAdditionalPercent).toBe(20);

    const domArrival = await service.composeFromPreparation(
      {} as never,
      [row('Domestic-International')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(domArrival.lines[0].unitPrice).toBe(25000);
    expect(domArrival.lines[0].sourceRef?.splitBaseScope).toBe('international');

    const domestic = await service.composeFromPreparation(
      {} as never,
      [row('Domestic')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(domestic.lines[0].unitPrice).toBe(10000);

    const otherStation = await service.composeFromPreparation(
      {} as never,
      [row('International-Domestic', 'BOM')],
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    expect(otherStation.lines[0].unitPrice).toBe(1);
  });

  it('prices Scheduled Flight rows on the volume band and keeps each rate as its own particular', async () => {
    const contract = {
      _id: new Types.ObjectId(),
      conditionalCharges: { extraGroundTimeAdditionalPercent: 20, filoChargesPercent: 60 },
      bhsVolumeSchedules: [
        {
          chargeKind: 'comprehensive' as const,
          flightScope: 'domestic_t1' as const,
          allocation: 'marginal' as const,
          overridesSavedRate: true,
          effectiveFrom: '2026-06-01',
          effectiveTo: '2027-05-31',
          bands: [
            { fromCount: 1, toCount: 1, unitPriceINR: 25603 },
            { fromCount: 2, toCount: null, unitPriceINR: 24834 },
          ],
        },
      ],
    };
    const row = (serialNo: string, snapshot: Record<string, unknown>) =>
      ({
        _id: new Types.ObjectId(),
        customerCode: 'QP',
        customerName: 'Akasa',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-08-31'),
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo, flightNo: serialNo },
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          terminal: 'T1',
          typeOfHandling: 'Turnaround',
          aircraftType: 'B737',
          staDate: '2026-08-02',
          staTime: serialNo === '1' ? '08:00' : '10:00',
          atdDate: '2026-08-02',
          atdTime: serialNo === '1' ? '09:00' : '12:00',
          ...snapshot,
        },
        rateMatch: { serviceCode: 'Scheduled Flight', unitPrice: 21662 },
      }) as never;

    const turnaround = row('1', {});
    const beyond = row('2', {
      ataDate: '2026-08-02',
      ataTime: '10:00',
      atdDate: '2026-08-02',
      atdTime: '12:00',
    });
    const records = [turnaround, beyond];
    const composed = await service.composeFromPreparation(
      {} as never,
      records,
      new Date('2026-08-31'),
      'INR',
      contract,
    );
    const prices = composed.lines.map((line) => line.unitPrice).sort((a, b) => a - b);
    expect(prices).toEqual([25603, 29800.8]);
    expect(composed.lines.map((line) => line.description).sort()).toEqual([
      'Charges for Turnaround handling [1 to 1 flights]',
      'Charges for Turnaround handling [2 flights and above] [ground time 120 min] [beyond 75 minutes ground time]',
    ]);

    const groups = splitBhsPreparationByUnitRate(records, contract);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);

    const ads = splitBhsPreparationByUnitRate(
      [row('1', { sourceType: 'ads' }), row('2', {})].map((record, index) => ({
        ...(record as object),
        sourceType: 'ads',
        sourceRef: { serialNo: String(index + 1) },
      })) as never,
      contract,
    );
    expect(ads).toHaveLength(1);
  });
});

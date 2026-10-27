import { Types } from 'mongoose';
import { InvoiceEngineService } from './invoice-engine.service';

describe('wheelchair invoice particular', () => {
  const taxEngine = {
    calculateLine: jest.fn(async (_ctx: unknown, input: { lineAmountExclTax: number }) => ({
      gstPercent: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      lineAmountInclTax: input.lineAmountExclTax,
    })),
  } as never;
  const currencyEngine = { resolveFactor: jest.fn(async () => 1) } as never;
  const emptyModel = { find: () => ({ select: () => ({ lean: async () => [] }) }) } as never;
  const service = new InvoiceEngineService(taxEngine, currencyEngine, emptyModel, emptyModel);

  const contract = {
    adsBillingEnabled: true,
    aircraftTypes: ['A320'],
    adsEquipmentRules: [
      {
        serviceCode: 'Wheel Chair - WCHR',
        includedForAds: true,
        freePerFlight: 10,
        unitPriceINR: 1050,
        uom: 'Per Service',
        aircraftTypes: ['A320'],
      },
    ],
  };

  function line(usageRowId: string, particular: string, qty: number) {
    return {
      _id: new Types.ObjectId(),
      customerCode: 'TG',
      customerName: 'Thai',
      billingPeriodStart: new Date('2026-09-01'),
      billingPeriodEnd: new Date('2026-09-30'),
      sourceType: 'ads',
      sourceRef: { serialNo: '1', usageRowId, flightNo: 'TG315' },
      operationalSnapshot: {
        aircraftType: 'A320',
        equipment_name: particular,
        adsParticular: particular,
        qty,
        serialNumber: '1',
      },
      rateMatch: {
        serviceCode: particular.includes('WCHS') ? 'WCHS' : 'WCHR',
        unitPrice: 1050,
        usedUnits: qty,
        freeAllowance: 10,
        particular,
        aircraftType: 'A320',
        uom: 'Per Service',
        pricingBasis: 'rate_card',
      },
    };
  }

  it('names a WCHR-only charge Wheel Chair - WCHR and keeps the shared quantity', async () => {
    const composed = await service.composeFromPreparation(
      {} as never,
      [line('a', 'Wheel Chair - WCHR', 12)] as never,
      new Date('2026-10-01'),
      'INR',
      contract,
    );
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('Wheel Chair - WCHR');
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(12);
    expect(composed.lines[0].quantity).toBe(2);
    expect(composed.lines[0].lineAmountExclTax).toBe(2100);
  });

  it('keeps Wheel Chair - WCHR/S when both chairs are charged on the flight', async () => {
    const composed = await service.composeFromPreparation(
      {} as never,
      [line('a', 'Wheel Chair - WCHR', 8), line('b', 'Wheel Chair - WCHS', 6)] as never,
      new Date('2026-10-01'),
      'INR',
      contract,
    );
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('Wheel Chair - WCHR/S');
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(14);
    expect(composed.lines[0].quantity).toBe(4);
    expect(composed.lines[0].lineAmountExclTax).toBe(4200);
  });

  it('keeps Wheel Chair - WCHR after regenerate stamps the combined prep label', async () => {
    const composed = await service.composeFromPreparation(
      {} as never,
      [
        {
          ...line('a', 'Wheel Chair - WCHR', 12),
          operationalSnapshot: {
            aircraftType: 'A320',
            equipment_name: 'Wheel Chair - WCHR',
            equipment: 'WCHR',
            adsParticular: 'Wheel Chair - WCHR/S',
            qty: 12,
            serialNumber: '1',
          },
          rateMatch: {
            serviceCode: 'Wheel Chair - WCHR/S',
            unitPrice: 1050,
            usedUnits: 12,
            freeAllowance: 10,
            particular: 'Wheel Chair - WCHR/S',
            aircraftType: 'A320',
            uom: 'Per Service',
            pricingBasis: 'rate_card',
          },
        },
      ] as never,
      new Date('2026-10-01'),
      'INR',
      contract,
    );
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].description).toBe('Wheel Chair - WCHR');
    expect(composed.lines[0].sourceRef?.particular).toBe('Wheel Chair - WCHR');
    expect(composed.lines[0].quantity).toBe(2);
    expect(composed.lines[0].lineAmountExclTax).toBe(2100);
  });

  it('names a WCHS-only charge Wheel Chair - WCHS', async () => {
    const composed = await service.composeFromPreparation(
      {} as never,
      [line('a', 'Wheel Chair - WCHS', 12)] as never,
      new Date('2026-10-01'),
      'INR',
      contract,
    );
    expect(composed.lines[0].description).toBe('Wheel Chair - WCHS');
    expect(composed.lines[0].quantity).toBe(2);
  });
});

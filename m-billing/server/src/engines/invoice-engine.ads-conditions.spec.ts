import { Types } from 'mongoose';
import { InvoiceEngineService } from './invoice-engine.service';
import { buildAdsAnnexureTable } from './ads-equipment-annexure.util';

/** ADS rules that depend on standby, the bay, scheduled ground time or a monthly pool. */
describe('InvoiceEngineService ADS contract conditions', () => {
  const taxEngine = {
    calculateLine: jest.fn(async (_ctx, input) => ({
      gstPercent: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      lineAmountInclTax: input.lineAmountExclTax,
    })),
  } as never;
  const currencyEngine = { resolveFactor: jest.fn(async () => 1) } as never;
  const emptyModel = {
    find: () => ({ select: () => ({ lean: async () => [] }) }),
  } as never;
  const engineWithFlights = (flights: unknown[]) =>
    new InvoiceEngineService(
      taxEngine,
      currencyEngine,
      { find: () => ({ select: () => ({ lean: async () => flights }) }) } as never,
      emptyModel,
    );
  const service = engineWithFlights([]);

  const use = (opts: {
    serial: string;
    equipment: string;
    serviceCode?: string;
    uom: string;
    unitPrice?: number;
    date?: string;
    qty?: number;
    usageHours?: number;
    remarks?: string;
    customerCode?: string;
  }) => ({
    _id: new Types.ObjectId(),
    customerCode: opts.customerCode ?? 'G9',
    customerName: 'Airline',
    billingPeriodStart: new Date('2026-09-01'),
    billingPeriodEnd: new Date('2026-09-30'),
    sourceType: 'ads',
    sourceRef: { serialNo: opts.serial, usageRowId: `${opts.serial}:${opts.equipment}`, flightNo: 'XX1' },
    operationalSnapshot: {
      aircraftType: 'A320',
      equipment_name: opts.equipment,
      adsParticular: opts.equipment,
      qty: opts.qty ?? 1,
      usageHours: opts.usageHours,
      remarks: opts.remarks,
      billingDateYmd: opts.date ?? '2026-09-01',
      serialNumber: opts.serial,
    },
    rateMatch: {
      serviceCode: opts.serviceCode ?? `ADS - Equipment - ${opts.equipment}`,
      unitPrice: opts.unitPrice ?? 0,
      usedUnits: opts.qty ?? 1,
      freeAllowance: 0,
      particular: opts.equipment,
      aircraftType: 'A320',
      uom: opts.uom,
      pricingBasis: 'rate_card',
    },
  });

  const compose = (
    engine: InvoiceEngineService,
    records: unknown[],
    contract: unknown,
    stationCode = 'DEL',
  ) =>
    engine.composeFromPreparation(
      { stationCode } as never,
      records as never,
      new Date('2026-10-01'),
      'INR',
      contract as never,
    );

  describe('standby equipment', () => {
    const rules = [
      {
        serviceCode: 'Ground Power Unit-140 KV',
        includedForAds: true,
        alwaysChargeable: true,
        unitPriceINR: 7800,
        uom: 'Per Turnaround',
        aircraftTypes: [],
      },
    ];
    const records = [
      use({ serial: '1', equipment: 'Ground Power Unit - 140KV', uom: 'Per Turnaround', remarks: '00:30' }),
      use({
        serial: '2',
        equipment: 'Ground Power Unit - 140KV',
        uom: 'Per Turnaround',
        remarks: '00:30 (STAND BY ON ARR)',
      }),
    ];

    it('bills standby units at the contract standby percent on their own line', async () => {
      const composed = await compose(service, records, {
        adsBillingEnabled: true,
        conditionalCharges: { standbyChargesPercent: 50 },
        adsEquipmentRules: rules,
      });
      expect(composed.lines).toHaveLength(2);
      const normal = composed.lines.find((line) => line.description === 'Ground Power Unit-140 KV')!;
      const standby = composed.lines.find((line) => line.description !== 'Ground Power Unit-140 KV')!;
      expect(normal.quantity).toBe(1);
      expect(normal.unitPrice).toBe(7800);
      expect(standby.description).toBe('Ground Power Unit-140 KV [50% stand by charged]');
      expect(standby.quantity).toBe(1);
      expect(standby.unitPrice).toBe(3900);
      expect(standby.lineAmountExclTax).toBe(3900);
      expect(standby.sourceRef?.standbyChargePercent).toBe(50);
      expect(composed.subtotalExclTax).toBe(11700);
    });

    it('bills standby in full when the contract has no standby percent', async () => {
      const composed = await compose(service, records, {
        adsBillingEnabled: true,
        adsEquipmentRules: rules,
      });
      expect(composed.lines).toHaveLength(1);
      expect(composed.lines[0].quantity).toBe(2);
      expect(composed.lines[0].unitPrice).toBe(7800);
    });
  });

  it('charges a per-turnaround passenger coach once per flight', async () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'Passenger Coach',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 190,
          uom: 'Per Turnaround',
          aircraftTypes: [],
        },
      ],
    };
    const composed = await compose(
      service,
      [
        use({ serial: '1', equipment: 'Passenger Coach', uom: 'Per Turnaround', qty: 3 }),
        use({ serial: '2', equipment: 'Passenger Coach', uom: 'Per Turnaround', qty: 2 }),
      ],
      contract,
    );
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(5);
    // Two flights, one charge each.
    expect(composed.lines[0].quantity).toBe(2);
    expect(composed.lines[0].lineAmountExclTax).toBe(380);
  });

  it('charges any per-turnaround equipment once per flight', async () => {
    const composed = await compose(
      service,
      [
        // Six GPU entries on three flights, as on the Air Arabia September invoice.
        use({ serial: '1', equipment: 'Ground Power Unit - 140KV', uom: 'Per Turnaround', remarks: '00:58' }),
        ...['a', 'b'].map((suffix) => ({
          ...use({ serial: '2', equipment: 'Ground Power Unit - 140KV', uom: 'Per Turnaround', remarks: '02:30' }),
          sourceRef: { serialNo: '2', usageRowId: `2:${suffix}`, flightNo: 'XX1' },
        })),
        ...['a', 'b', 'c'].map((suffix) => ({
          ...use({ serial: '3', equipment: 'Ground Power Unit - 140KV', uom: 'Per Turnaround', remarks: '00:52' }),
          sourceRef: { serialNo: '3', usageRowId: `3:${suffix}`, flightNo: 'XX1' },
        })),
      ],
      {
        adsBillingEnabled: true,
        adsEquipmentRules: [
          {
            serviceCode: 'Ground Power Unit-140 KV',
            includedForAds: true,
            alwaysChargeable: true,
            unitPriceINR: 7800,
            uom: 'Per Turnaround',
            aircraftTypes: [],
          },
        ],
      },
    );
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(6);
    expect(composed.lines[0].quantity).toBe(3);
  });

  it('never bills a row marked "Charged on request only"', async () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'Ramp Car',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 2200,
          uom: 'Per Hour',
          remarks: 'Charged on request only',
          aircraftTypes: [],
        },
        {
          serviceCode: 'Crew Coach',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 5400,
          uom: 'Per Trip',
          aircraftTypes: [],
        },
      ],
    };
    const composed = await compose(
      service,
      [
        use({ serial: '1', equipment: 'Ramp Car', uom: 'Per Hour', usageHours: 2 }),
        use({ serial: '1', equipment: 'Crew Coach', uom: 'Per Trip' }),
      ],
      contract,
    );
    expect(composed.lines.map((line) => line.description)).toEqual(['Crew Coach']);
  });

  it('keeps charging every trip when the passenger coach is priced per trip', async () => {
    const composed = await compose(
      service,
      [use({ serial: '1', equipment: 'Passenger Coach', uom: 'Per Trip', qty: 3 })],
      {
        adsBillingEnabled: true,
        adsEquipmentRules: [
          {
            serviceCode: 'Passenger Coach',
            includedForAds: true,
            alwaysChargeable: true,
            unitPriceINR: 579,
            uom: 'Per Trip',
            aircraftTypes: [],
          },
        ],
      },
    );
    expect(composed.lines[0].quantity).toBe(3);
  });

  describe('free at a remote bay', () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'Passenger Coach',
          includedForAds: true,
          alwaysChargeable: false,
          unitPriceINR: 190,
          uom: 'Per Turnaround',
          remarks: 'FOC for Remote Bay',
          aircraftTypes: [],
        },
      ],
    };
    const records = [
      use({ serial: '1', equipment: 'Passenger Coach', uom: 'Per Turnaround', qty: 2 }),
      use({ serial: '2', equipment: 'Passenger Coach', uom: 'Per Turnaround', qty: 3 }),
      use({ serial: '3', equipment: 'Passenger Coach', uom: 'Per Turnaround', qty: 1 }),
    ];
    const flights = [
      { SerialNo: 1, stationCode: 'DEL', rampDetails1: { BayFinal: 'R-04' } },
      { SerialNo: 2, stationCode: 'DEL', rampDetails1: { BayFinal: 'A08' } },
      { SerialNo: 3, stationCode: 'DEL', rampDetails1: { BayFinal: '' } },
    ];

    it('bills only flights that were not at a remote bay', async () => {
      const composed = await compose(engineWithFlights(flights), records, contract);
      expect(composed.lines).toHaveLength(1);
      expect(composed.lines[0].sourceRef?.usedQuantity).toBe(6);
      // Remote flight is free. Contact flight and the flight with no bay are charged once each.
      expect(composed.lines[0].quantity).toBe(2);
      expect(composed.lines[0].sourceRef?.chargedByFlight).toEqual({ '2': 1, '3': 1 });
    });

    it('prints the same per-flight counts on the annexure', async () => {
      const composed = await compose(engineWithFlights(flights), records, contract);
      const table = buildAdsAnnexureTable(records as never, contract.adsEquipmentRules, composed.lines);
      const key = table.columns[0].key;
      expect(table.rows.map((row) => row.serialNo)).toEqual(['2', '3']);
      expect(table.totals[key]).toBe(2);
    });
  });

  describe('free for the scheduled ground time', () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'Ground Power Unit-140 KV',
          includedForAds: true,
          alwaysChargeable: false,
          unitPriceINR: 6600,
          uom: 'Per Hour',
          remarks: 'FOC for SGT time',
          aircraftTypes: [],
        },
      ],
    };
    const scheduled = (serial: number) => ({
      SerialNo: serial,
      stationCode: 'DEL',
      mainDetails: {
        STADate: '01/09/2026',
        STATime: '10:00',
        STDDate: '01/09/2026',
        STDTime: '11:30',
      },
    });

    it('bills only the hours beyond the scheduled ground time', async () => {
      const composed = await compose(
        engineWithFlights([scheduled(1), scheduled(2)]),
        [
          // 3 h used, 1 h 30 scheduled → 1 h 30 beyond → 2 hours.
          use({
            serial: '1',
            equipment: 'Ground Power Unit - 140KV',
            uom: 'Per Hour',
            usageHours: 3,
            customerCode: 'CX',
          }),
          // Inside the scheduled ground time → free.
          use({
            serial: '2',
            equipment: 'Ground Power Unit - 140KV',
            uom: 'Per Hour',
            usageHours: 1,
            customerCode: 'CX',
          }),
        ],
        contract,
      );
      expect(composed.lines).toHaveLength(1);
      expect(composed.lines[0].quantity).toBe(2);
      expect(composed.lines[0].sourceRef?.usedQuantity).toBe(4);
      expect(composed.lines[0].lineAmountExclTax).toBe(13200);
    });

    it('bills the whole use when the flight has no scheduled times', async () => {
      const composed = await compose(
        engineWithFlights([{ SerialNo: 1, stationCode: 'DEL', mainDetails: {} }]),
        [
          use({
            serial: '1',
            equipment: 'Ground Power Unit - 140KV',
            uom: 'Per Hour',
            usageHours: 3,
            customerCode: 'CX',
          }),
        ],
        contract,
      );
      expect(composed.lines[0].quantity).toBe(3);
    });
  });

  it('gives one monthly pool of free wheelchairs to WCHR, WCHS and WCHC together', async () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'Wheel Chair - WCHR/S',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 600,
          uom: 'Per Service',
          remarks: '5 Per month based on double daily flights',
          aircraftTypes: [],
        },
        {
          // No price: these chairs are not billed, but they use up the pool.
          serviceCode: 'WCHC',
          includedForAds: true,
          alwaysChargeable: true,
          uom: 'Per Service',
          remarks: '5 Per month based on double daily flights',
          aircraftTypes: [],
        },
      ],
    };
    const chair = (serial: string, code: 'WCHR' | 'WCHS' | 'WCHC', qty: number, date: string) =>
      use({
        serial,
        equipment: code,
        serviceCode: `Scheduled Flight - ${code}`,
        uom: 'Per Service',
        qty,
        date,
        customerCode: 'CX',
      });
    const records = [
      // Given out of date order on purpose.
      chair('3', 'WCHR', 4, '2026-09-03'),
      chair('1', 'WCHS', 3, '2026-09-01'),
      chair('2', 'WCHC', 1, '2026-09-02'),
    ];
    const composed = await compose(service, records, contract);
    // Pool of 5: 3 on the 1st, 1 WCHC on the 2nd, 1 of the 4 on the 3rd. 3 are charged.
    expect(composed.lines).toHaveLength(1);
    expect(composed.lines[0].quantity).toBe(3);
    expect(composed.lines[0].unitPrice).toBe(600);
    expect(composed.lines[0].sourceRef?.usedQuantity).toBe(7);
    expect(composed.lines[0].sourceRef?.freeAllowance).toBe(4);
    expect(composed.lines[0].sourceRef?.chargedByFlight).toEqual({ '3': 3 });

    const table = buildAdsAnnexureTable(records as never, contract.adsEquipmentRules, composed.lines);
    expect(table.rows.map((row) => row.serialNo)).toEqual(['3']);
    expect(Object.values(table.totals)).toEqual([3]);
  });

  it('bills nothing while the month stays inside the wheelchair pool', async () => {
    const contract = {
      adsBillingEnabled: true,
      adsEquipmentRules: [
        {
          serviceCode: 'Wheel Chair - WCHR/S',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 600,
          uom: 'Per Service',
          remarks: '900 Per month based on double daily flights',
          aircraftTypes: [],
        },
      ],
    };
    // 900 used against a pool of 900: nothing is left to invoice.
    const chairs = (serial: string, qty: number, date: string) =>
      use({
        serial,
        equipment: 'WCHR',
        serviceCode: 'Scheduled Flight - WCHR',
        uom: 'Per Service',
        qty,
        date,
        customerCode: 'CX',
      });
    await expect(
      compose(service, [chairs('1', 400, '2026-09-01'), chairs('2', 500, '2026-09-02')], contract),
    ).rejects.toThrow('No billable invoice lines');
  });
});

import {
  adsAnnexureColumnLabel,
  adsAnnexureTitleLine,
  adsAnnexureBillableRules,
  buildAdsAnnexureTable,
} from './ads-equipment-annexure.util';

describe('ads equipment annexure', () => {
  it('prints the shared ADS title with the invoice number', () => {
    expect(
      adsAnnexureTitleLine({
        monthLabel: 'September-2026',
        invoiceNumber: 'SI/DL/327/002033',
      }),
    ).toBe(
      'Additional Equipment Annexure for the month September-2026 against Invoice No.:-SI/DL/327/002033',
    );
  });

  it('shortens contract service codes to annexure headers', () => {
    expect(adsAnnexureColumnLabel('Scheduled - Equipment - GPU-NB')).toBe('GPU-NB');
    expect(adsAnnexureColumnLabel('GPU 140 KV')).toBe('GPU-140KV');
    expect(adsAnnexureColumnLabel('Ground Power Unit - 180KV')).toBe('GPU-180KV');
    expect(adsAnnexureColumnLabel('Ground Power Unit - 140KV')).toBe('GPU-140KV');
    expect(adsAnnexureColumnLabel('Scheduled - Equipment - ASU-WB')).toBe('ASU-WB');
    expect(adsAnnexureColumnLabel('Motorized Passenger Step Ladder')).toBe('PSL-WB');
    expect(adsAnnexureColumnLabel('Crew Coach')).toBe('CREW-COACH');
    expect(adsAnnexureColumnLabel('WCHR')).toBe('WCHR/S');
    expect(adsAnnexureColumnLabel('Wheel Chair - WCHS')).toBe('WCHR/S');
    expect(adsAnnexureColumnLabel('WCHC')).toBe('WCHC');
  });

  it('drops unpriced and excluded clauses', () => {
    const rules = adsAnnexureBillableRules([
      { serviceCode: 'GPU-NB', unitPriceINR: 9500, alwaysChargeable: true },
      { serviceCode: 'LDL', unitPriceINR: 0 },
      { serviceCode: 'Waste', unitPriceINR: 10, includedForAds: false },
    ]);
    expect(rules.map((rule) => rule.serviceCode)).toEqual(['GPU-NB']);
  });

  it('lists used flights and splits WCHR/S into Total then CHARGEABLE when FOC applies', () => {
    const rules = [
      {
        serviceCode: 'Scheduled - Equipment - WCHR',
        unitPriceINR: 1050,
        alwaysChargeable: false,
        freePerFlight: 10,
      },
      {
        serviceCode: 'Scheduled - Equipment - ACU-NB',
        unitPriceINR: 16500,
        alwaysChargeable: true,
        freePerFlight: 0,
      },
    ];
    const table = buildAdsAnnexureTable(
      [
        {
          sourceRef: { serialNo: '214149', flightNo: 'LX146/147' },
          operationalSnapshot: {
            equipment_name: 'ACU',
            particular: 'Air Conditioner Unit',
            aircraftType: 'A330-300',
            atdDate: '2026-09-02',
            qty: 1,
          },
          rateMatch: { particular: 'Air Conditioner Unit', usedUnits: 1 },
        },
        {
          sourceRef: { serialNo: '214150', flightNo: 'LX148' },
          operationalSnapshot: {
            equipment_name: 'WCHR',
            particular: 'Wheel Chair -WCHR',
            aircraftType: 'A330-300',
            atdDate: '2026-09-03',
            qty: 4,
          },
          rateMatch: { particular: 'Wheel Chair -WCHR', usedUnits: 4 },
        },
        {
          sourceRef: { serialNo: '214151', flightNo: 'LX149' },
          operationalSnapshot: {
            equipment_name: 'WCHR',
            particular: 'Wheel Chair -WCHR',
            aircraftType: 'A330-300',
            atdDate: '2026-09-04',
            qty: 12,
          },
          rateMatch: { particular: 'Wheel Chair -WCHR', usedUnits: 12 },
        },
      ],
      rules,
    );

    expect(table.columns.map((column) => column.label)).toEqual([
      'ACU-NB',
      'Total WCHR/S',
      'CHARGEABLE WCHR/S',
    ]);
    expect(table.rows).toHaveLength(3);
    const acuKey = table.columns.find((column) => column.label === 'ACU-NB')!.key;
    const usedKey = table.columns.find((column) => column.label === 'Total WCHR/S')!.key;
    const chargedKey = table.columns.find((column) => column.label === 'CHARGEABLE WCHR/S')!.key;
    expect(table.rows[0]).toMatchObject({
      serialNo: '214149',
      flightNo: 'LX146/147',
      aircraftType: 'A330-300',
      atdDate: '02/09/26',
      counts: { [acuKey]: 1 },
    });
    expect(table.rows[1].serialNo).toBe('214150');
    expect(table.rows[1].counts[usedKey]).toBe(4);
    expect(table.rows[1].counts[chargedKey]).toBeUndefined();
    expect(table.rows[2].serialNo).toBe('214151');
    expect(table.rows[2].counts[usedKey]).toBe(12);
    expect(table.rows[2].counts[chargedKey]).toBe(2);
    expect(table.totals[acuKey]).toBe(1);
    expect(table.totals[usedKey]).toBe(16);
    expect(table.totals[chargedKey]).toBe(2);
  });

  it('combines WCHR and WCHS on one flight before applying FOC', () => {
    const table = buildAdsAnnexureTable(
      [
        {
          sourceRef: { serialNo: '216111', flightNo: 'VS300' },
          operationalSnapshot: {
            equipment_name: 'WCHS',
            particular: 'Wheel Chair -WCHS',
            aircraftType: 'B787-900',
            atdDate: '2026-09-29',
            qty: 24,
          },
          rateMatch: { particular: 'Wheel Chair -WCHS', usedUnits: 24, serviceCode: 'WCHS' },
        },
        {
          sourceRef: { serialNo: '216111', flightNo: 'VS300' },
          operationalSnapshot: {
            equipment_name: 'WCHR',
            particular: 'Wheel Chair -WCHR',
            aircraftType: 'B787-900',
            atdDate: '2026-09-29',
            qty: 17,
          },
          rateMatch: { particular: 'Wheel Chair -WCHR', usedUnits: 17, serviceCode: 'WCHR' },
        },
      ],
      [
        {
          serviceCode: 'WCHR',
          unitPriceINR: 1091,
          alwaysChargeable: false,
          freePerFlight: 10,
        },
      ],
    );
    expect(table.columns.map((column) => column.label)).toEqual([
      'Total WCHR/S',
      'CHARGEABLE WCHR/S',
    ]);
    expect(table.rows).toHaveLength(1);
    const usedKey = table.columns[0]!.key;
    const chargedKey = table.columns[1]!.key;
    expect(table.rows[0]!.counts[usedKey]).toBe(41);
    expect(table.rows[0]!.counts[chargedKey]).toBe(31);
    expect(table.totals[usedKey]).toBe(41);
    expect(table.totals[chargedKey]).toBe(31);
  });

  it('keeps a single column when invoice Used and Charged are the same', () => {
    const table = buildAdsAnnexureTable(
      [
        {
          sourceRef: { serialNo: '216111', flightNo: 'VS300' },
          operationalSnapshot: {
            equipment_name: 'GPU-WB',
            particular: 'Ground Power Unit - Wide Body',
            aircraftType: 'B787-900',
            atdDate: '2026-09-29',
            qty: 9,
          },
          rateMatch: {
            particular: 'Ground Power Unit - 180KV',
            usedUnits: 9,
            serviceCode: 'Ground Power Unit - 180KV',
          },
        },
      ],
      [
        {
          serviceCode: 'Ground Power Unit - 180KV',
          unitPriceINR: 3176,
          alwaysChargeable: true,
          uom: 'Per 15 Min',
        },
        {
          serviceCode: 'Toilet Service',
          unitPriceINR: 1000,
          alwaysChargeable: true,
        },
      ],
      [
        {
          description: 'Ground Power Unit - 180KV',
          quantity: 9,
          sourceType: 'ads',
          serviceCode: 'ADS',
          sourceRef: {
            particular: 'Ground Power Unit - 180KV',
            equipmentServiceCode: 'Ground Power Unit - 180KV',
            usedQuantity: 9,
            chargedQuantity: 9,
          },
        },
      ],
    );
    expect(table.columns.map((column) => column.label)).toEqual(['GPU-180KV']);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]!.counts[table.columns[0]!.key]).toBe(9);
    expect(table.totals[table.columns[0]!.key]).toBe(9);
  });

  it('prints invoice particulars as headers and splits Used vs Charged when they differ', () => {
    const table = buildAdsAnnexureTable(
      [
        {
          sourceRef: { serialNo: '1', flightNo: 'VS300' },
          operationalSnapshot: {
            equipment_name: 'WCHR',
            particular: 'Wheel Chair -WCHR',
            aircraftType: 'B787-900',
            atdDate: '2026-09-01',
            qty: 20,
          },
          rateMatch: { particular: 'Wheel Chair -WCHR', usedUnits: 20, serviceCode: 'WCHR' },
        },
        {
          sourceRef: { serialNo: '1', flightNo: 'VS300' },
          operationalSnapshot: {
            equipment_name: 'GPU-140KV',
            particular: 'Ground Power Unit - 140KV',
            aircraftType: 'B787-900',
            atdDate: '2026-09-01',
            qty: 9,
          },
          rateMatch: {
            particular: 'Ground Power Unit - 140KV',
            usedUnits: 9,
            serviceCode: 'Ground Power Unit - 140KV',
          },
        },
      ],
      [
        {
          serviceCode: 'WCHR',
          unitPriceINR: 1091,
          alwaysChargeable: false,
          freePerFlight: 10,
        },
        {
          serviceCode: 'Ground Power Unit - 140KV',
          unitPriceINR: 3176,
          alwaysChargeable: true,
        },
        {
          serviceCode: 'Toilet Service',
          unitPriceINR: 500,
          alwaysChargeable: true,
        },
      ],
      [
        {
          description: 'Wheel Chair - WCHR/S',
          quantity: 10,
          sourceType: 'ads',
          serviceCode: 'ADS',
          sourceRef: {
            particular: 'Wheel Chair - WCHR/S',
            usedQuantity: 20,
            chargedQuantity: 10,
          },
        },
        {
          description: 'Ground Power Unit - 140KV',
          quantity: 9,
          sourceType: 'ads',
          serviceCode: 'ADS',
          sourceRef: {
            particular: 'Ground Power Unit - 140KV',
            usedQuantity: 9,
            chargedQuantity: 9,
          },
        },
      ],
    );
    expect(table.columns.map((column) => column.label)).toEqual([
      'Total WCHR/S',
      'CHARGEABLE WCHR/S',
      'GPU-140KV',
    ]);
    const usedKey = table.columns[0]!.key;
    const chargedKey = table.columns[1]!.key;
    const gpuKey = table.columns[2]!.key;
    expect(table.rows[0]!.counts[usedKey]).toBe(20);
    expect(table.rows[0]!.counts[chargedKey]).toBe(10);
    expect(table.rows[0]!.counts[gpuKey]).toBe(9);
  });

  it('keeps one Crew Coach pair when the invoice has a line per aircraft', () => {
    const table = buildAdsAnnexureTable(
      [
        {
          sourceRef: { serialNo: '1', flightNo: 'QY548' },
          operationalSnapshot: {
            equipment_name: 'Crew Coach',
            particular: 'Crew Coach',
            aircraftType: 'A330-200F',
            atdDate: '2026-09-19',
            qty: 2,
          },
          rateMatch: { particular: 'Crew Coach', usedUnits: 2, serviceCode: 'Crew Coach', unitPrice: 54 },
        },
        {
          sourceRef: { serialNo: '2', flightNo: 'QY667' },
          operationalSnapshot: {
            equipment_name: 'Crew Coach',
            particular: 'Crew Coach',
            aircraftType: 'A330-300F',
            atdDate: '2026-09-20',
            qty: 2,
          },
          rateMatch: { particular: 'Crew Coach', usedUnits: 2, serviceCode: 'Crew Coach', unitPrice: 54 },
        },
      ],
      [{ serviceCode: 'Crew Coach', unitPriceINR: 54, freePerFlight: 1, alwaysChargeable: false }],
      [
        {
          description: 'Crew Coach',
          quantity: 1,
          sourceType: 'ads',
          serviceCode: 'ADS',
          sourceRef: { particular: 'Crew Coach', aircraftType: 'A330-200F', usedQuantity: 2, chargedQuantity: 1 },
        },
        {
          description: 'Crew Coach',
          quantity: 1,
          sourceType: 'ads',
          serviceCode: 'ADS',
          sourceRef: { particular: 'Crew Coach', aircraftType: 'A330-300F', usedQuantity: 1, chargedQuantity: 1 },
        },
      ],
    );
    expect(table.columns.map((column) => column.label)).toEqual([
      'Total CREW-COACH',
      'CHARGEABLE CREW-COACH',
    ]);
  });
});

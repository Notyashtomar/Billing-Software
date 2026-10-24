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

  it('counts billed uses per flight and omits flights still inside FOC', () => {
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

    expect(table.columns.map((column) => column.label)).toEqual(['ACU-NB', 'WCHR/S']);
    expect(table.rows).toHaveLength(2);
    const acuKey = table.columns.find((column) => column.label === 'ACU-NB')!.key;
    const wchrKey = table.columns.find((column) => column.label === 'WCHR/S')!.key;
    expect(table.rows[0]).toMatchObject({
      serialNo: '214149',
      flightNo: 'LX146/147',
      aircraftType: 'A330-300',
      atdDate: '02/09/26',
      counts: { [acuKey]: 1 },
    });
    expect(table.rows[1].serialNo).toBe('214151');
    expect(table.rows[1].counts[wchrKey]).toBe(2);
    expect(table.rows.some((row) => row.serialNo === '214150')).toBe(false);
    expect(table.totals[acuKey]).toBe(1);
    expect(table.totals[wchrKey]).toBe(2);
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
    expect(table.columns.map((column) => column.label)).toEqual(['WCHR/S']);
    expect(table.rows).toHaveLength(1);
    const key = table.columns[0]!.key;
    expect(table.rows[0]!.counts[key]).toBe(31);
    expect(table.totals[key]).toBe(31);
  });
});

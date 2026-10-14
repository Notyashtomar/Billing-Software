import {
  buildAdsCatalogIndex,
  classifyAdsSourceType,
  computeAdsUsedUnits,
  mapFhrDocToAdsRows,
  parseAdsRemarksQuantity,
  parseUsageHours,
  resolveAdsParticularName,
  resolveCatalogItem,
} from '../shared/fhr-equipment-to-ads-row';

describe('parseAdsRemarksQuantity', () => {
  it('reads TRIP counts from FHR remarks', () => {
    expect(parseAdsRemarksQuantity('01:30 DEP - 06TRIP')).toBe(6);
    expect(parseAdsRemarksQuantity('00:30 ARR - 05TRIP')).toBe(5);
    expect(parseAdsRemarksQuantity('09:30 A-1 D-2 03TRIPS')).toBe(3);
  });

  it('sums Arrival / Departure counts', () => {
    expect(parseAdsRemarksQuantity('13:20 Arrival 04 // Departure 04')).toBe(8);
    expect(parseAdsRemarksQuantity('A-1 D-2')).toBe(3);
  });

  it('reads trailing count after duration', () => {
    expect(parseAdsRemarksQuantity('13:20 08')).toBe(8);
    expect(parseAdsRemarksQuantity('05:55 02')).toBe(2);
  });

  it('ignores pure duration remarks', () => {
    expect(parseAdsRemarksQuantity('00:11')).toBeNull();
    expect(parseAdsRemarksQuantity('1:30')).toBeNull();
    expect(parseAdsRemarksQuantity('')).toBeNull();
  });
});

describe('computeAdsUsedUnits with remarks', () => {
  it('multiplies qty by remarks trip count for non-time UOMs', () => {
    expect(
      computeAdsUsedUnits({
        qty: 1,
        usageHours: 1.5,
        uom: 'Per Trip',
        remarksQuantity: 6,
      }),
    ).toBe(6);
    expect(
      computeAdsUsedUnits({
        qty: 2,
        usageHours: null,
        uom: 'Per Service',
        remarksQuantity: 3,
      }),
    ).toBe(6);
  });

  it('ignores remarks quantity for hourly UOMs', () => {
    expect(
      computeAdsUsedUnits({
        qty: 1,
        usageHours: 1.5,
        uom: 'Per Hour',
        remarksQuantity: 6,
      }),
    ).toBe(2);
  });
});

describe('fhr-equipment-to-ads-row', () => {
  const catalog = buildAdsCatalogIndex([
    { abbr: 'EBT', description: 'Electric Baggage Tractor', unit_type: 'equipment' },
    { abbr: 'LDL', description: 'Lower Deck Loader', unit_type: 'equipment' },
    { abbr: 'CSA', description: 'Customer Service Agent', unit_type: 'manpower' },
  ]);

  it('resolves catalog abbr to billing full-form particular', () => {
    const item = resolveCatalogItem('EBT', catalog);
    expect(item?.description).toBe('Electric Baggage Tractor');
    expect(resolveAdsParticularName('EBT', item)).toBe('Electric Baggage Trolly');
  });

  it('fuzzy-matches inconsistent equipment labels to catalog abbr', () => {
    const gpuCatalog = buildAdsCatalogIndex([
      { abbr: 'GPU-NB', description: 'Ground Power Unit -90KV', unit_type: 'equipment' },
      { abbr: 'EBT', description: 'Electric Baggage Tractor', unit_type: 'equipment' },
    ]);
    expect(resolveCatalogItem('GPU - NB', gpuCatalog)?.abbr).toBe('GPU-NB');
    expect(resolveCatalogItem('Ground Power Unit -90KV', gpuCatalog)?.abbr).toBe('GPU-NB');
    expect(resolveCatalogItem('GPU-90KV', gpuCatalog)?.abbr).toBe('GPU-NB');
    expect(resolveCatalogItem('electric baggage tractor', gpuCatalog)?.abbr).toBe('EBT');
  });

  it('maps July 2026 MAA flight with inconsistent GPU label', () => {
    const gpuCatalog = buildAdsCatalogIndex([
      { abbr: 'GPU-NB', description: 'Ground Power Unit -90KV', unit_type: 'equipment' },
      { abbr: 'LDL', description: 'Lower Deck Loader', unit_type: 'equipment' },
    ]);
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 22001,
        mainDetails: {
          Arline_Code: 'IX2718',
          Airline: 'Air India Express',
          TypeCraft: 'B738',
          STADate: '15/07/2026',
          ATDDate: '15/07/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'Ground Power Unit - 90KV',
            equipment_quantity: 1,
            from_date: '15/07/2026',
            usage_time: '01:30',
          },
          {
            equipment_name: 'LDL',
            equipment_quantity: 2,
            from_date: '15/07/2026',
          },
        ],
      },
      gpuCatalog,
      { fromYmd: '2026-07-01', toYmd: '2026-07-31', flightWindowYmd: '2026-07-15' },
    );
    expect(rows).toHaveLength(2);
    const gpu = rows.find((r) => String(r.operationalData.equipment_name).includes('90KV'));
    expect(gpu?.operationalData.particular).toBe('Ground Power Unit - Narrow Body');
    expect(gpu?.billingDate).toBe('2026-07-15');
    expect(rows.find((r) => r.operationalData.equipment_name === 'LDL')?.operationalData.qty).toBe(2);
  });

  it('parses legacy EQ: pipe-encoded equipment names', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 22002,
        mainDetails: {
          Arline_Code: 'SG458',
          STADate: '20/07/2026',
          ATDDate: '20/07/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'EQ: GPU-NB | GSE-4412 | Operator',
            equipment_quantity: 1,
            from_date: '20/07/2026',
            usage_time: '01:00',
          },
        ],
      },
      buildAdsCatalogIndex([
        { abbr: 'GPU-NB', description: 'Ground Power Unit -90KV', unit_type: 'equipment' },
      ]),
      { fromYmd: '2026-07-01', toYmd: '2026-07-31', flightWindowYmd: '2026-07-20' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].operationalData.equipment_name).toBe('GPU-NB');
    expect(rows[0].operationalData.particular).toBe('Ground Power Unit - Narrow Body');
  });

  it('classifies manpower vs equipment', () => {
    expect(classifyAdsSourceType('CSA', resolveCatalogItem('CSA', catalog))).toBe(
      'manpower',
    );
    expect(classifyAdsSourceType('LDL', resolveCatalogItem('LDL', catalog))).toBe(
      'equipment',
    );
    expect(classifyAdsSourceType('WW', null)).toBe('manpower');
    expect(classifyAdsSourceType('CSH', null)).toBe('manpower');
    expect(classifyAdsSourceType('Sup', null)).toBe('manpower');
    expect(classifyAdsSourceType('WC', null)).toBe('equipment');
    expect(classifyAdsSourceType('White Collar', null)).toBe('manpower');
    expect(classifyAdsSourceType('GPU-90KV', null)).toBe('equipment');
  });

  it('parses usage hours and computes hourly used units', () => {
    expect(parseUsageHours('05:00')).toBe(5);
    expect(parseUsageHours('00:30')).toBe(0.5);
    // Per Hour bills by started hour and ignores quantity (time-based).
    expect(
      computeAdsUsedUnits({ qty: 2, usageHours: 1.5, uom: 'Per Hour' }),
    ).toBe(2);
    expect(
      computeAdsUsedUnits({ qty: 2, usageHours: 1.5, uom: 'Per Service' }),
    ).toBe(2);
    // Any engagement bills at least one hour.
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 20 / 60, uom: 'Per Hour' }),
    ).toBe(1);
    expect(
      computeAdsUsedUnits({
        qty: 1,
        usageHours: 72.96666666666665,
        uom: 'Per Hour',
      }),
    ).toBe(73);
  });

  it('Per Hour applies a 5-minute grace on the hour boundary', () => {
    // 4h05m → within grace → 4 hours.
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 4 + 5 / 60, uom: 'Per Hour' }),
    ).toBe(4);
    // 4h06m → over grace → 5 hours.
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 4 + 6 / 60, uom: 'Per Hour' }),
    ).toBe(5);
    // Exactly on the hour → no extra.
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 4, uom: 'Per Hour' }),
    ).toBe(4);
  });

  it('Per Half Hour rounds up to the next 30-minute block (no grace)', () => {
    // 4h30m = 270min → 9 half-hours.
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 4.5, uom: 'Per Half Hour' }),
    ).toBe(9);
    // 4h16m = 256min → ceil(256/30) = 9.
    expect(
      computeAdsUsedUnits({
        qty: 1,
        usageHours: 4 + 16 / 60,
        uom: 'Per Half Hour',
      }),
    ).toBe(9);
    // Quantity ignored for time-based UOM.
    expect(
      computeAdsUsedUnits({ qty: 3, usageHours: 4.5, uom: 'Per Half Hour' }),
    ).toBe(9);
    // Any engagement bills at least one half-hour block.
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 3 / 60, uom: 'Per Half Hour' }),
    ).toBe(1);
  });

  it('Per 15 Minutes rounds up to the next 15-minute block (no grace)', () => {
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 1, uom: 'Per 15 Minutes' }),
    ).toBe(4);
    expect(
      computeAdsUsedUnits({ qty: 2, usageHours: 0.5, uom: 'per 15 minutes' }),
    ).toBe(2);
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 16 / 60, uom: 'Per 15 Minutes' }),
    ).toBe(2);
    expect(
      computeAdsUsedUnits({ qty: 1, usageHours: 3 / 60, uom: 'Per 15 Minutes' }),
    ).toBe(1);
  });

  it('maps FHR equipmentDetails into ADS rows and skips empty names', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 17635,
        mainDetails: {
          Arline_Code: 'SG',
          ArrivalFltNo: 'SG123',
          DepartureFltNo: 'SG456',
          TypeCraft: 'A330-200',
          Cate_of_Flight: 'Domestic',
          STADate: '01/04/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'EBT',
            equipment_quantity: 1,
            from_date: '01/04/2026',
            usage_time: '01:00',
          },
          {
            equipment_name: '',
            equipment_quantity: 1,
            from_date: '01/04/2026',
          },
          {
            equipment_name: 'CSA',
            equipment_quantity: 1,
            from_date: '01/04/2026',
            usage_time: '05:00',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-04-01', toYmd: '2026-04-30' },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].sourceType).toBe('equipment');
    expect(rows[0].operationalData.particular).toBe('Electric Baggage Trolly');
    expect(rows[0].sourceRef.flightNo).toBe('SG123/SG456');
    expect(rows[0].operationalData.flightNoEquipmentNo).toBe('SG123/SG456');
    expect(rows[0].sourceRef.usageRowId).toBe('17635:0');
    expect(rows[0].customerCode).toBe('SG');
    expect(rows[1].sourceType).toBe('manpower');
    expect(rows[1].operationalData.particular).toBe('Customer Service Agent');
  });

  it('includes equipment lines outside search range when flightWindowYmd is set (BHS parity)', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 20001,
        mainDetails: {
          Arline_Code: 'IX',
          ArrivalFltNo: 'IX100',
          TypeCraft: 'A320',
          STADate: '31/05/2026',
          ATDDate: '01/06/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'GPU-90KV',
            equipment_quantity: 1,
            from_date: '31/05/2026',
            usage_time: '01:00',
          },
        ],
      },
      catalog,
      {
        fromYmd: '2026-06-01',
        toYmd: '2026-06-30',
        flightWindowYmd: '2026-06-01',
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].billingDate).toBe('2026-06-01');
    expect(rows[0].operationalData.billingDateYmd).toBe('2026-06-01');
  });

  it('normalizes Arline_Code flight number to airline code (IX2718 → IX)', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 19315,
        mainDetails: {
          Arline_Code: 'IX2718',
          ArrivalFltNo: 'IX2718',
          TypeCraft: 'B738',
          STADate: '15/06/2026',
          ATDDate: '15/06/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'GPU-90KV',
            equipment_quantity: 1,
            from_date: '15/06/2026',
            usage_time: '00:30',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-15' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].customerCode).toBe('IX');
  });

  it('reads flight number from Arline_Code when Arrival/Departure empty (MAA)', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 19400,
        mainDetails: {
          Arline_Code: 'IX2660/2975',
          Airline: 'Air India Express',
          TypeCraft: 'B738',
          STADate: '05/06/2026',
          ATDDate: '05/06/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'GPU-NB',
            equipment_quantity: 1,
            from_date: '05/06/2026',
            usage_time: '01:00',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-05' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].customerCode).toBe('IX');
    expect(rows[0].sourceRef.flightNo).toBe('IX2660/2975');
    expect(rows[0].operationalData.serialNumber).toBe('19400');
  });

  it('reads flight number from terminalDetails when main Arrival/Departure empty', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 17632,
        mainDetails: {
          Arline_Code: 'SG',
          ArrivalFltNo: '',
          DepartureFltNo: '',
          STADate: '31/03/2026',
        },
        terminalDetails: {
          FlightNo: 'SG458/9458',
        },
        equipmentDetails: [
          {
            equipment_name: 'EBT',
            equipment_quantity: 1,
            from_date: '31/03/2026',
            usage_time: '01:00',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-02-28', toYmd: '2026-03-31' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceRef.flightNo).toBe('SG458/9458');
    expect(rows[0].operationalData.flightNoEquipmentNo).toBe('SG458/9458');
  });

  it('filters lines outside period', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 1,
        mainDetails: { Arline_Code: '6E', FlightNo: '6E1', STADate: '01/03/2026' },
        equipmentDetails: [
          {
            equipment_name: 'LDL',
            equipment_quantity: 1,
            from_date: '15/03/2026',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-04-01', toYmd: '2026-04-30' },
    );
    expect(rows).toHaveLength(0);
  });

  it('maps Terminal Details form wheelchair fields (arrival/departure R/S/C)', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 20010,
        mainDetails: {
          Arline_Code: 'G8',
          ArrivalFltNo: 'G8100',
          TypeCraft: 'B737',
          STADate: '10/06/2026',
          ATDDate: '10/06/2026',
        },
        terminalDetails: {
          arrivalWheelChairR: 2,
          arrivalWheelChairS: 1,
          arrivalWheelChairC: 3,
          departureWheelChairR: 4,
          departureWheelChairS: 0,
          departureWheelChairC: 1,
        },
        equipmentDetails: [],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-10' },
    );

    const byCode = Object.fromEntries(
      rows.map((r) => [
        String(r.operationalData.equipment_name),
        Number(r.operationalData.qty),
      ]),
    );
    expect(byCode.WCHR).toBe(6); // 2 arrival + 4 departure
    expect(byCode.WCHS).toBe(1); // 1 arrival + 0 departure
    expect(byCode.WCHC).toBe(4); // 3 arrival + 1 departure
    expect(rows.every((r) => r.serviceCode.startsWith('Scheduled Flight - WCH'))).toBe(
      true,
    );
  });

  it('reads legacy Excel wheelchair keys without double-counting UI aliases', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 20011,
        mainDetails: {
          Arline_Code: 'SG',
          ArrivalFltNo: 'SG1',
          TypeCraft: 'B737',
          STADate: '11/06/2026',
          ATDDate: '11/06/2026',
        },
        terminalDetails: {
          wcr: 5,
          Departure_wcr: 2,
          // Same values mirrored on UI keys — must not double-count.
          arrivalWheelChairR: 5,
          departureWheelChairR: 2,
        },
        equipmentDetails: [],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-11' },
    );
    const wchr = rows.find((r) => r.operationalData.equipment_name === 'WCHR');
    expect(wchr?.operationalData.qty).toBe(7);
    expect(wchr?.operationalData.particular).toBe('Wheel Chair -WCHR');
  });

  it('synthesizes Cabin Cleaning from ramp CleaningFr/To when equipment lacks it', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 21001,
        mainDetails: {
          Arline_Code: 'IX2718',
          Airline: 'Air India Express',
          TypeCraft: 'B738',
          STADate: '05/06/2026',
          ATDDate: '05/06/2026',
        },
        rampDetails1: {
          CleaningFr: '05/06/2026 21:10',
          CleaningTo: '05/06/2026 21:40',
          cleaningStartedTime: '21:10',
          cleaningClosedTime: '21:40',
        },
        equipmentDetails: [
          {
            equipment_name: 'GPU-NB',
            equipment_quantity: 1,
            from_date: '05/06/2026',
            usage_time: '01:00',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-05' },
    );

    const cabin = rows.find(
      (r) => String(r.operationalData.particular) === 'Cabin Cleaning',
    );
    expect(cabin).toBeTruthy();
    expect(cabin?.sourceRef.usageRowId).toBe('21001:cleaning:cabin');
    expect(cabin?.serviceCode).toBe('ADS - Equipment - Cabin Cleaning');
    expect(rows.some((r) => String(r.operationalData.particular) === 'Night Halt Cleaning')).toBe(
      false,
    );
  });

  it('adds Night Halt Cleaning when ramp cleaning + ifNightHalt', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 21002,
        mainDetails: {
          Arline_Code: 'IX',
          Airline: 'Air India Express',
          TypeCraft: 'B738',
          STADate: '06/06/2026',
          ATDDate: '06/06/2026',
        },
        rampDetails1: {
          CleaningFr: '06/06/2026 02:00',
          CleaningTo: '06/06/2026 02:30',
          ifNightHalt: true,
        },
        equipmentDetails: [],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-06' },
    );

    const particulars = rows.map((r) => String(r.operationalData.particular));
    expect(particulars).toEqual(
      expect.arrayContaining(['Cabin Cleaning', 'Night Halt Cleaning']),
    );
    expect(
      rows.find((r) => String(r.operationalData.particular) === 'Night Halt Cleaning')
        ?.sourceRef.usageRowId,
    ).toBe('21002:cleaning:night-halt');
  });

  it('does not double Cabin Cleaning when equipmentDetails already has it', () => {
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 21003,
        mainDetails: {
          Arline_Code: 'IX',
          STADate: '07/06/2026',
          ATDDate: '07/06/2026',
        },
        rampDetails1: {
          CleaningFr: '07/06/2026 10:00',
          CleaningTo: '07/06/2026 10:20',
        },
        equipmentDetails: [
          {
            equipment_name: 'Cabin Cleaning',
            equipment_quantity: 1,
            from_date: '07/06/2026',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-06-01', toYmd: '2026-06-30', flightWindowYmd: '2026-06-07' },
    );

    const cabinRows = rows.filter(
      (r) => String(r.operationalData.particular).toLowerCase() === 'cabin cleaning',
    );
    expect(cabinRows).toHaveLength(1);
    expect(cabinRows[0].sourceRef.usageRowId).toBe('21003:0');
  });

  it('turnaround: collapses ARR+DEP Crew Coach to one charged unit', () => {
    const catalog = buildAdsCatalogIndex([
      { abbr: 'Crew-Coach-1', description: 'Crew Coach', unit_type: 'equipment' },
    ]);
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 19993,
        mainDetails: {
          Arline_Code: 'IX2007/2661',
          ArrivalFltNo: 'IX2007',
          DepartureFltNo: 'IX2661',
          TypeofHandling: 'Turnaround',
          TypeCraft: 'B738',
          STADate: '01/07/2026',
          ATDDate: '01/07/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'Crew-Coach-1',
            equipment_quantity: 1,
            from_date: '01/07/2026',
            remarks: '00:35 ARR 01 TRIP',
          },
          {
            equipment_name: 'Crew-Coach-1',
            equipment_quantity: 1,
            from_date: '01/07/2026',
            remarks: '00:35 DEP 01 TRIP',
          },
          {
            equipment_name: 'EBT',
            equipment_quantity: 1,
            from_date: '01/07/2026',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-07-01', toYmd: '2026-07-31', flightWindowYmd: '2026-07-01' },
    );

    const crew = rows.filter((r) =>
      /crew\s*coach/i.test(String(r.operationalData.particular ?? '')),
    );
    expect(crew).toHaveLength(1);
    expect(crew[0].operationalData.qty).toBe(1);
    expect(crew[0].operationalData.remarksQuantity).toBe(1);
    expect(crew[0].operationalData.chargeableUnits).toBe(1);
    expect(crew[0].operationalData.turnaroundCrewCoachCapped).toBe(true);
    // Non-crew equipment untouched.
    expect(
      rows.some((r) => String(r.operationalData.equipment_name) === 'EBT'),
    ).toBe(true);
  });

  it('turnaround: caps multi-TRIP Crew Coach remarks to 1 unit', () => {
    const catalog = buildAdsCatalogIndex([
      { abbr: 'Crew Coach', description: 'Crew Coach', unit_type: 'equipment' },
    ]);
    const rows = mapFhrDocToAdsRows(
      {
        SerialNo: 20017,
        mainDetails: {
          Arline_Code: 'IX2926/1354',
          ops: 'Turnaround',
          TypeCraft: 'B738',
          STADate: '02/07/2026',
          ATDDate: '02/07/2026',
        },
        equipmentDetails: [
          {
            equipment_name: 'Crew Coach',
            equipment_quantity: 1,
            from_date: '02/07/2026',
            remarks: '00:20 02 TRIP ARR',
          },
        ],
      },
      catalog,
      { fromYmd: '2026-07-01', toYmd: '2026-07-31', flightWindowYmd: '2026-07-02' },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].operationalData.remarksQuantity).toBe(1);
    expect(rows[0].operationalData.chargeableUnits).toBe(1);
  });
});

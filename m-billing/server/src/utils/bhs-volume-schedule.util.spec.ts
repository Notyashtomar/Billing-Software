import {
  akasaDelhiComprehensiveSchedules,
  bhsVolumeArrivalSortKey,
  classifyBhsVolumeScope,
  classifySplitTurnaround,
  marginalMonthTotal,
  resolveBhsVolumePrices,
  splitComprehensiveUnitPrice,
  type BhsVolumeFlightInput,
} from './bhs-volume-schedule.util';

function flight(
  id: string,
  snapshot: Record<string, unknown>,
  extra?: Partial<BhsVolumeFlightInput>,
): BhsVolumeFlightInput {
  return {
    id,
    sourceType: 'scheduled_flight',
    billingPeriodStart: '2026-08-01',
    operationalSnapshot: { staDate: '2026-08-10', staTime: '10:00', ...snapshot },
    rateMatch: { serviceCode: 'BHS', unitPrice: 99999 },
    sourceRef: { serialNo: id, flightNo: id },
    ...extra,
  };
}

describe('bhs volume schedules', () => {
  const schedules = akasaDelhiComprehensiveSchedules();

  it('prices 720 domestic T1 flights across all three bands', () => {
    const t1 = schedules[0];
    expect(marginalMonthTotal(720, t1.bands)).toBe(500 * 25603 + 100 * 24834 + 120 * 24322);
    const population = Array.from({ length: 720 }, (_, index) => {
      const id = String(index + 1).padStart(4, '0');
      return flight(
        id,
        {
          categoryOfFlight: 'Domestic',
          terminal: 'T1',
          staTime: '08:00',
          staDate: '2026-08-01',
        },
        { sourceRef: { serialNo: id, flightNo: id } },
      );
    });
    const hits = resolveBhsVolumePrices(population, schedules);
    expect(hits.get('0001')?.unitPrice).toBe(25603);
    expect(hits.get('0500')?.unitPrice).toBe(25603);
    expect(hits.get('0501')?.unitPrice).toBe(24834);
    expect(hits.get('0600')?.unitPrice).toBe(24834);
    expect(hits.get('0601')?.unitPrice).toBe(24322);
    expect(hits.get('0720')?.unitPrice).toBe(24322);
    expect(hits.get('0720')?.savedUnitPrice).toBe(99999);
  });

  it('keeps domestic T2, international, and charter on their own rates', () => {
    const population = [
      flight('t2', { categoryOfFlight: 'Domestic', terminal: 'Terminal 2' }),
      flight('int', { categoryOfFlight: 'International', terminal: 'T3' }),
      flight('ch-d', { categoryOfFlight: 'Domestic', typeOfFlight: 'Charter', terminal: 'T1' }),
      flight('ch-i', { categoryOfFlight: 'International', typeOfHandling: 'Charter' }),
      flight('split', { categoryOfFlight: 'Domestic-International', terminal: 'T1' }),
      flight('blank', { categoryOfFlight: 'Domestic' }),
    ];
    const hits = resolveBhsVolumePrices(population, schedules);
    expect(hits.get('t2')?.unitPrice).toBe(20545);
    expect(hits.get('int')?.unitPrice).toBe(24140);
    expect(hits.get('ch-d')?.unitPrice).toBe(27693);
    expect(hits.get('ch-i')?.unitPrice).toBe(40639);
    expect(hits.has('split')).toBe(false);
    expect(hits.has('blank')).toBe(false);
  });

  it('ranks a partial invoice by the whole month population', () => {
    const population = [1, 2, 3, 4, 5].map((n) =>
      flight(String(n), {
        categoryOfFlight: 'Dom',
        terminal: 'T1',
        staTime: `0${n}:00`,
      }),
    );
    const hits = resolveBhsVolumePrices(population, [
      {
        chargeKind: 'comprehensive',
        flightScope: 'domestic_t1',
        allocation: 'marginal',
        overridesSavedRate: true,
        bands: [
          { fromCount: 1, toCount: 3, unitPriceINR: 100 },
          { fromCount: 4, toCount: null, unitPriceINR: 50 },
        ],
      },
    ]);
    expect(hits.get('5')?.unitPrice).toBe(50);
    expect(hits.get('5')?.monthIndex).toBe(5);
  });

  it('ranks by ATD date and time, earliest departure first', () => {
    const population = [
      flight('atd-late', {
        categoryOfFlight: 'Domestic',
        terminal: 'T1',
        ataDate: '2026-08-10',
        ataTime: '05:00',
        atdDate: '2026-08-10',
        atdTime: '18:40',
      }),
      flight('atd-early', {
        categoryOfFlight: 'Domestic',
        terminal: 'T1',
        ataDate: '2026-08-10',
        ataTime: '20:00',
        atdDate: '2026-08-10',
        atdTime: '06:10',
      }),
      flight('std-mid', {
        categoryOfFlight: 'Domestic',
        terminal: 'T1',
        staDate: '2026-08-10',
        staTime: '01:00',
        stdDate: '2026-08-10',
        stdTime: '12:00',
      }),
    ];
    expect(
      bhsVolumeArrivalSortKey(population[1]) < bhsVolumeArrivalSortKey(population[2]),
    ).toBe(true);
    const hits = resolveBhsVolumePrices(population, [
      {
        chargeKind: 'comprehensive',
        flightScope: 'domestic_t1',
        allocation: 'marginal',
        overridesSavedRate: true,
        bands: [
          { fromCount: 1, toCount: 2, unitPriceINR: 25603 },
          { fromCount: 3, toCount: null, unitPriceINR: 24322 },
        ],
      },
    ]);
    expect(hits.get('atd-early')?.monthIndex).toBe(1);
    expect(hits.get('std-mid')?.monthIndex).toBe(2);
    expect(hits.get('atd-late')?.monthIndex).toBe(3);
    expect(hits.get('atd-early')?.unitPrice).toBe(25603);
    expect(hits.get('atd-late')?.unitPrice).toBe(24322);
  });

  it('ignores schedules outside the row-5 window', () => {
    const hits = resolveBhsVolumePrices(
      [
        flight('old', {
          categoryOfFlight: 'Domestic',
          terminal: 'T1',
          staDate: '2026-05-01',
        }),
      ],
      schedules,
    );
    expect(hits.has('old')).toBe(false);
  });

  it('applies volume bands when the saved service code is Scheduled Flight', () => {
    const hits = resolveBhsVolumePrices(
      [
        flight(
          'sf',
          { categoryOfFlight: 'Domestic', terminal: 'T1' },
          { rateMatch: { serviceCode: 'Scheduled Flight', unitPrice: 21662 } },
        ),
        flight(
          'equip',
          { categoryOfFlight: 'Domestic', terminal: 'T1' },
          { rateMatch: { serviceCode: 'Scheduled Flight - WCHR', unitPrice: 500 } },
        ),
      ],
      schedules,
    );
    expect(hits.get('sf')?.unitPrice).toBe(25603);
    expect(hits.has('equip')).toBe(false);
  });

  it('prices Delhi split turnarounds from the named comprehensive band', () => {
    expect(classifySplitTurnaround('International-Domestic')).toBe(
      'int_arrival_dom_departure',
    );
    expect(classifySplitTurnaround('Domestic-International')).toBe(
      'dom_arrival_int_departure',
    );
    expect(classifySplitTurnaround('Domestic')).toBeNull();

    const schedules = akasaDelhiComprehensiveSchedules();
    const scopeCounts = new Map<string, number>([
      ['domestic_t1', 500],
      ['international', 150],
    ]);
    const intArrival = splitComprehensiveUnitPrice({
      category: 'International-Domestic',
      stationCode: 'DEL',
      snapshot: { terminal: 'T1' },
      schedules,
      scopeCounts,
      splitOrdinal: new Map(),
      savedUnitPrice: 1,
      intArrivalDomDeparturePercent: 20,
      domArrivalIntDeparturePercent: 25,
    });
    expect(intArrival?.baseUnitPrice).toBe(24834);
    expect(intArrival?.unitPrice).toBe(29800.8);

    const domArrival = splitComprehensiveUnitPrice({
      category: 'Domestic-International',
      stationCode: 'DEL',
      snapshot: { terminal: 'T3' },
      schedules,
      scopeCounts,
      splitOrdinal: new Map(),
      savedUnitPrice: 1,
      intArrivalDomDeparturePercent: 20,
      domArrivalIntDeparturePercent: 25,
    });
    expect(domArrival?.baseUnitPrice).toBe(23415);
    expect(domArrival?.unitPrice).toBe(29268.75);

    expect(
      splitComprehensiveUnitPrice({
        category: 'International-Domestic',
        stationCode: 'BOM',
        snapshot: { terminal: 'T1' },
        schedules,
        scopeCounts,
        splitOrdinal: new Map(),
        savedUnitPrice: 10000,
        intArrivalDomDeparturePercent: 20,
        domArrivalIntDeparturePercent: 25,
      }),
    ).toBeNull();
  });

  it('classifies arrival terminal before sector', () => {
    expect(classifyBhsVolumeScope({ categoryOfFlight: 'Domestic', terminal: 'T2' })).toBe(
      'domestic_t2',
    );
    expect(classifyBhsVolumeScope({ categoryOfFlight: 'International', terminal: 'T1' })).toBe(
      'international',
    );
  });
});

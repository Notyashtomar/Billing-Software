import {
  adsCatalogServiceDisplayName,
  buildAdsContractCatalogOptions,
  dedupeServiceCatalogItems,
  formatServiceCatalogDisplayCode,
  inferCatalogMeta,
  isDroppedAdsCatalogService,
  resolveAdsContractCatalogValue,
  SERVICE_CATALOG_LABELS,
  serviceCatalogCodesForDisplayKey,
  stripCatalogServicePrefix,
} from '../service-catalog-labels';

describe('stripCatalogServicePrefix', () => {
  it('removes Scheduled / RAF / Non-Scheduled equipment and manpower prefixes', () => {
    expect(stripCatalogServicePrefix('Scheduled - Equipment - ACU')).toBe('ACU');
    expect(stripCatalogServicePrefix('RAF - Equipment - MDL')).toBe('MDL');
    expect(stripCatalogServicePrefix('Non Scheduled - Equipment - GPU-90KV')).toBe('GPU-90KV');
    expect(stripCatalogServicePrefix('Scheduled - Manpower - CSA')).toBe('CSA');
    expect(stripCatalogServicePrefix('RAF - Manpower - BC')).toBe('BC');
    expect(stripCatalogServicePrefix('Scheduled Flight - WCHR')).toBe('WCHR');
  });

  it('drops empty leftover prefixes', () => {
    expect(stripCatalogServicePrefix('Scheduled - Equipment -')).toBe('');
    expect(stripCatalogServicePrefix('Non Scheduled - Equipment -')).toBe('');
  });
});

describe('formatServiceCatalogDisplayCode', () => {
  it('keeps Equipment / Manpower names after dropping schedule wrappers', () => {
    expect(
      formatServiceCatalogDisplayCode('Cancel Scheduled - Equipment - Cabin Cleaning'),
    ).toBe('Equipment - Cabin Cleaning');
    expect(formatServiceCatalogDisplayCode('Non Scheduled - Equipment - ACU')).toBe(
      'Equipment - Air Conditioner Unit',
    );
    expect(formatServiceCatalogDisplayCode('Scheduled - Manpower - CSA')).toBe(
      'Manpower - Customer Service Agent',
    );
    expect(formatServiceCatalogDisplayCode('RAF - Equipment - GPU-90KV')).toBe(
      'Equipment - Ground Power Unit - Narrow Body',
    );
    expect(formatServiceCatalogDisplayCode('Cancel Scheduled Flight')).toBe('Flight');
    expect(formatServiceCatalogDisplayCode('Non Scheduled Flight - WCHR')).toBe(
      'Flight - Wheel Chair - WCHR',
    );
    expect(formatServiceCatalogDisplayCode('Manpower')).toBe('Manpower');
  });
});

describe('dedupeServiceCatalogItems', () => {
  it('keeps one row per unique equipment / manpower display name', () => {
    const unique = dedupeServiceCatalogItems(
      SERVICE_CATALOG_LABELS.map((serviceCode) => ({ serviceCode, active: true })),
    );
    const labels = unique.map((row) => formatServiceCatalogDisplayCode(row.serviceCode));
    expect(labels.filter((label) => label === 'Equipment - Air Conditioner Unit')).toHaveLength(1);
    expect(labels.filter((label) => label === 'Manpower - Customer Service Agent')).toHaveLength(1);
    expect(labels.some((label) => /^equipment\s*-\s*$/i.test(label))).toBe(false);
    expect(labels).toContain('Equipment - Air Conditioner Unit');
    expect(labels).toContain('Manpower');
  });

  it('prefers scheduled twin as the representative', () => {
    const unique = dedupeServiceCatalogItems([
      { serviceCode: 'RAF - Equipment - MDL', active: true },
      { serviceCode: 'Scheduled - Equipment - MDL', active: true },
      { serviceCode: 'Non Scheduled - Equipment - MDL', active: true },
    ]);
    expect(unique).toHaveLength(1);
    expect(unique[0]?.serviceCode).toBe('Scheduled - Equipment - MDL');
  });

  it('expands a display key back to all twin codes', () => {
    const items = [
      { serviceCode: 'Scheduled - Equipment - MDL' },
      { serviceCode: 'RAF - Equipment - MDL' },
      { serviceCode: 'Scheduled - Equipment - ACU' },
    ];
    expect(serviceCatalogCodesForDisplayKey(items, 'RAF - Equipment - MDL').sort()).toEqual([
      'RAF - Equipment - MDL',
      'Scheduled - Equipment - MDL',
    ]);
  });
});

describe('adsCatalogServiceDisplayName', () => {
  it('drops c1 equipment', () => {
    expect(isDroppedAdsCatalogService('Scheduled - Equipment - c1')).toBe(true);
    expect(isDroppedAdsCatalogService('RAF - Equipment - c1')).toBe(true);
    expect(adsCatalogServiceDisplayName('Non Scheduled - Equipment - c1')).toBe('');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - AMB')).toBe('Ambulift');
  });

  it('drops cancel-only catalog rows from the ADS contract dropdown', () => {
    expect(isDroppedAdsCatalogService('Cancel Scheduled - Equipment - Cabin Cleaning')).toBe(true);
    expect(adsCatalogServiceDisplayName('Cancel Scheduled - Equipment - Cabin Cleaning')).toBe('');
    expect(isDroppedAdsCatalogService('Cancel Scheduled Flight')).toBe(true);
    expect(adsCatalogServiceDisplayName('Cancel Scheduled Flight')).toBe('');
  });

  it('renames common ADS equipment / manpower codes for the contract dropdown', () => {
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - ACU')).toBe(
      'Air Conditioner Unit',
    );
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - ACU-NB')).toBe(
      'Air Conditioner Unit - Narrow Body',
    );
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - HS')).toBe('Headset');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - ISTNB')).toBe(
      'Inter Stand Tow Narrow Body',
    );
    expect(adsCatalogServiceDisplayName('RAF - Equipment - Tow')).toBe('Towbar');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - RC')).toBe('Ramp Car');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - TRE')).toBe('Trestle');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - TS')).toBe('Toilet Service');
    expect(adsCatalogServiceDisplayName('Scheduled - Manpower - WC')).toBe('White Collar');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - WC')).toBe('Water Cart');
    expect(adsCatalogServiceDisplayName('Scheduled - Manpower - BC')).toBe('Blue Collar');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - BC')).toBe('Baggage Cart');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - BMW')).toBe('Vehicle - BMW');
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - MG')).toBe('Vehicle - MG');
    expect(isDroppedAdsCatalogService('Scheduled - Equipment - URB')).toBe(true);
    expect(adsCatalogServiceDisplayName('Scheduled - Equipment - URB')).toBe('');
  });
});

describe('buildAdsContractCatalogOptions', () => {
  it('dedupes prefixed equipment and drops c1', () => {
    const options = buildAdsContractCatalogOptions(
      SERVICE_CATALOG_LABELS.map((serviceCode) => ({ serviceCode })),
    );
    const labels = options.map((option) => option.label);

    expect(labels).toContain('Main Deck Loader');
    expect(labels.filter((label) => label === 'Main Deck Loader')).toHaveLength(1);
    expect(labels).toContain('Customer Service Agent');
    expect(labels).toContain('Ambulift');
    expect(labels.some((label) => /c1/i.test(label))).toBe(false);
    expect(labels.some((label) => /^urb$/i.test(label))).toBe(false);
    expect(labels.some((label) => /^cancel cabin cleaning$/i.test(label))).toBe(false);
    expect(labels.some((label) => /^cancel scheduled flight$/i.test(label))).toBe(false);
    expect(labels).toContain('Headset');
    expect(labels).toContain('Vehicle - BMW');
    expect(labels.some((label) => /scheduled\s*-\s*equipment/i.test(label))).toBe(false);
    expect(labels.some((label) => /^raf\s*-/i.test(label))).toBe(false);
    expect(labels.some((label) => /non[-\s]*scheduled\s*-\s*equipment/i.test(label))).toBe(
      false,
    );
    expect(labels.some((label) => /scheduled\s*-\s*manpower/i.test(label))).toBe(false);
  });

  it('resolves a prefixed stored rule onto the unique option', () => {
    const options = buildAdsContractCatalogOptions([
      { serviceCode: 'Scheduled - Equipment - MDL' },
      { serviceCode: 'RAF - Equipment - MDL' },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]?.label).toBe('Main Deck Loader');
    expect(resolveAdsContractCatalogValue('RAF - Equipment - MDL', options)).toBe(
      options[0]?.value,
    );
    expect(resolveAdsContractCatalogValue('Scheduled - Equipment - c1', options)).toBe('');
    expect(resolveAdsContractCatalogValue('', options)).toBe('');
  });

  it('lists Blue Collar once under the scheduled manpower code, per hour', () => {
    const options = buildAdsContractCatalogOptions([
      { serviceCode: 'Non Scheduled - Manpower - BC', uom: 'Per Hour', category: 'manpower' },
      { serviceCode: 'RAF - Manpower - BC', uom: 'Per Hour', category: 'manpower' },
      { serviceCode: 'Scheduled - Manpower - BC', uom: 'Per Hour', category: 'manpower' },
      { serviceCode: 'Scheduled - Equipment - BC', uom: 'EA', category: 'equipment' },
    ]);
    const blue = options.filter((option) => option.label === 'Blue Collar');
    expect(blue).toHaveLength(1);
    expect(blue[0]?.value).toBe('Scheduled - Manpower - BC');
    expect(blue[0]?.uom).toBe('Per Hour');
    expect(blue[0]?.category).toBe('manpower');
    expect(options.some((option) => option.label === 'Baggage Cart')).toBe(true);
    expect(
      resolveAdsContractCatalogValue('Scheduled - Manpower - BC', options),
    ).toBe('Scheduled - Manpower - BC');
  });
});

describe('inferCatalogMeta', () => {
  it('correctly maps equipment to their actual units of measurement', () => {
    // Time-based (Per Hour)
    expect(inferCatalogMeta('Scheduled - Equipment - ACU')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - GPU-90KV')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - LDL')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - MDL')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - EBT')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - BT')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - BMW')).toEqual({
      category: 'equipment',
      uom: 'Per Hour',
    });

    // Ambulift / Usage
    expect(inferCatalogMeta('Scheduled - Equipment - AMB')).toEqual({
      category: 'equipment',
      uom: 'Per Usage',
    });

    // Air Start Unit
    expect(inferCatalogMeta('Scheduled - Equipment - ASU-NB')).toEqual({
      category: 'equipment',
      uom: 'Per start',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - ASU-WB')).toEqual({
      category: 'equipment',
      uom: 'Per start',
    });

    // Step Ladders & Headset (Turnaround)
    expect(inferCatalogMeta('Scheduled - Equipment - BFL-Towable')).toEqual({
      category: 'equipment',
      uom: 'Per Turnaround',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - PSL-Towable')).toEqual({
      category: 'equipment',
      uom: 'Per Turnaround',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - HS')).toEqual({
      category: 'equipment',
      uom: 'Per Turnaround',
    });

    // Coaches / Buses (Trip)
    expect(inferCatalogMeta('Scheduled - Equipment - PAX Coach')).toEqual({
      category: 'equipment',
      uom: 'Per Trip',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - Crew Coach')).toEqual({
      category: 'equipment',
      uom: 'Per Trip',
    });

    // Pushback & Services (Per service)
    expect(inferCatalogMeta('Scheduled - Equipment - PBNB')).toEqual({
      category: 'equipment',
      uom: 'Per service',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - TS')).toEqual({
      category: 'equipment',
      uom: 'Per service',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - WC')).toEqual({
      category: 'equipment',
      uom: 'Per service',
    });

    // Towbars & Towing (Per push/tow & Per Tow)
    expect(inferCatalogMeta('Scheduled - Equipment - Tow')).toEqual({
      category: 'equipment',
      uom: 'Per push/tow',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - Long Towbar')).toEqual({
      category: 'equipment',
      uom: 'Per push/tow',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - ISTNB')).toEqual({
      category: 'equipment',
      uom: 'Per Tow',
    });

    // Unit equipment (EA)
    expect(inferCatalogMeta('Scheduled - Equipment - FE')).toEqual({
      category: 'equipment',
      uom: 'EA',
    });
    expect(inferCatalogMeta('Scheduled - Equipment - CK')).toEqual({
      category: 'equipment',
      uom: 'EA',
    });
  });

  it('correctly maps cleaning, manpower, flights, and wheelchairs', () => {
    expect(inferCatalogMeta('Scheduled - Equipment - Cabin Cleaning')).toEqual({
      category: 'cleaning',
      uom: 'FLIGHT',
    });
    expect(inferCatalogMeta('Scheduled - Manpower - CSA')).toEqual({
      category: 'manpower',
      uom: 'HR',
    });
    expect(inferCatalogMeta('Scheduled Flight')).toEqual({
      category: 'scheduled',
      uom: 'FLIGHT',
    });
    expect(inferCatalogMeta('Scheduled Flight - WCHR')).toEqual({
      category: 'scheduled',
      uom: 'EA',
    });
    expect(inferCatalogMeta('PU-WCHR-S')).toEqual({
      category: 'scheduled',
      uom: 'EA',
    });
  });
});


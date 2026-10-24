import {
  pickEquipmentMasterForAdsRule,
  syncAdsRulesToEquipmentMaster,
} from './sync-ads-rules-to-equipment-master';

const catalog = [
  {
    itemNo: 'GPU-WB',
    description: 'Ground Power Unit - Wide Body',
    uoms: [
      { uom: 'Per 15 Minutes', abbreviation: 'P15' },
      { uom: 'Per Hour', abbreviation: 'PH' },
    ],
  },
  {
    itemNo: 'GPU-NB',
    description: 'Ground Power Unit - Narrow Body',
    uoms: [{ uom: 'Per 15 Minutes', abbreviation: 'P15' }],
  },
  {
    itemNo: 'WCHR',
    description: 'Wheel Chair - WCHR',
    uoms: [{ uom: 'Per Service', abbreviation: 'PS' }],
  },
  {
    itemNo: 'ASU-NB',
    description: 'Air Start Unit - Narrow Body',
    uoms: [{ uom: 'Per service', abbreviation: '' }],
  },
];

describe('syncAdsRulesToEquipmentMaster', () => {
  it('maps GPU-180KV onto the wide-body master listing and expands extra UOMs without a price', () => {
    const result = syncAdsRulesToEquipmentMaster(
      [
        {
          serviceCode: 'GPU-180KV',
          uom: 'per 15 mins',
          unitPriceINR: 3301,
          alwaysChargeable: true,
        },
      ],
      catalog,
    );

    expect(result.matched).toBe(1);
    expect(result.expanded).toBe(1);
    expect(result.rules).toEqual([
      {
        serviceCode: 'Ground Power Unit - Wide Body',
        uom: 'Per 15 Minutes',
        unitPriceINR: 3301,
        alwaysChargeable: true,
      },
      {
        serviceCode: 'Ground Power Unit - Wide Body',
        uom: 'Per Hour',
        unitPriceINR: undefined,
        unitPriceUSD: undefined,
        alwaysChargeable: true,
      },
    ]);
  });

  it('keeps GPU-140KV on the narrow-body listing', () => {
    const result = syncAdsRulesToEquipmentMaster(
      [{ serviceCode: 'GPU-140KV', uom: 'Per 15 Minutes', unitPriceINR: 3176 }],
      catalog,
    );
    expect(result.rules).toEqual([
      {
        serviceCode: 'Ground Power Unit - Narrow Body',
        uom: 'Per 15 Minutes',
        unitPriceINR: 3176,
      },
    ]);
  });

  it('maps wheelchair aliases onto the master service name', () => {
    expect(pickEquipmentMasterForAdsRule('WCHR', catalog)?.description).toBe('Wheel Chair - WCHR');
    const result = syncAdsRulesToEquipmentMaster(
      [{ serviceCode: 'WCHR', uom: 'Per service', unitPriceINR: 500 }],
      catalog,
    );
    expect(result.rules[0]).toMatchObject({
      serviceCode: 'Wheel Chair - WCHR',
      uom: 'Per Service',
      unitPriceINR: 500,
    });
  });

  it('strips Scheduled / Equipment prefixes before matching catalog codes', () => {
    expect(
      pickEquipmentMasterForAdsRule('Scheduled - Equipment - GPU-180KV', catalog)?.itemNo,
    ).toBe('GPU-WB');
  });

  it('leaves unmatched rules unchanged', () => {
    const result = syncAdsRulesToEquipmentMaster(
      [{ serviceCode: 'Unknown Widget', uom: 'EA', unitPriceINR: 1 }],
      catalog,
    );
    expect(result.unmatched).toEqual(['Unknown Widget']);
    expect(result.rules).toEqual([{ serviceCode: 'Unknown Widget', uom: 'EA', unitPriceINR: 1 }]);
  });
});

import {
  ADS_WCHR_S_PARTICULAR,
  adsEquipmentFamilyKey,
  adsEquipmentLabelsMatch,
  contractBillsBmeEquipment,
  isBmeAdsEquipmentLabel,
  isWchrSCombinedAdsService,
  resolveAdsPricingFromContractRule,
} from './ads-equipment-inclusion.util';

describe('ads-equipment-inclusion.util', () => {
  const ixContract = {
    adsBillingEnabled: true,
    aircraftTypes: ['A320', 'A321'],
    adsEquipmentRules: [
      {
        serviceCode: 'GPU-NB',
        includedForAds: true,
        unitPriceINR: 12206,
        uom: 'Per Hour',
        aircraftTypes: ['A320', 'A321'],
        effectiveMonth: '2026-06',
      },
    ],
  };

  it('maps FHR KV / full names onto GPU-NB family', () => {
    expect(adsEquipmentFamilyKey('GPU-90KV')).toBe('GPU-NB');
    expect(adsEquipmentFamilyKey('Ground Power Unit -140KV')).toBe('GPU-NB');
    expect(adsEquipmentFamilyKey('ADS - Equipment - GPU-90KV')).toBe('GPU-NB');
    expect(adsEquipmentFamilyKey('GPU-NB')).toBe('GPU-NB');
    expect(adsEquipmentFamilyKey('GPU-180KV')).toBe('GPU-WB');
    expect(adsEquipmentFamilyKey('WCHR')).toBe('WCHR/S');
    expect(adsEquipmentFamilyKey('Wheel Chair - WCHS')).toBe('WCHR/S');
    expect(adsEquipmentFamilyKey('Wheel Chair - WCHR/S')).toBe('WCHR/S');
    expect(adsEquipmentFamilyKey('WCHC')).toBe('WCHC');
    expect(isWchrSCombinedAdsService('WCHR', 'WCHS')).toBe(true);
    expect(isWchrSCombinedAdsService('Wheel Chair - WCHC')).toBe(false);
    expect(adsEquipmentLabelsMatch('WCHR', 'WCHS')).toBe(true);
    expect(adsEquipmentLabelsMatch('WCHR', 'WCHC')).toBe(false);
  });

  it('prices FHR GPU-90KV from contract GPU-NB rule', () => {
    const priced = resolveAdsPricingFromContractRule(ixContract, {
      serviceCode: 'ADS - Equipment - Ground Power Unit -90KV',
      particular: 'Ground Power Unit -90KV',
      equipmentName: 'GPU-90KV',
      aircraftType: 'A320',
      billingCurrency: 'INR',
      effectiveMonth: '2026-06',
    });
    expect(priced.matched).toBe(true);
    expect(priced.excluded).toBe(false);
    expect(priced.unitPrice).toBe(12206);
  });

  it('matches Scheduled - Equipment - GPU- prefix rules to FHR GPU variants', () => {
    const priced = resolveAdsPricingFromContractRule(
      {
        adsBillingEnabled: true,
        aircraftTypes: ['B738'],
        adsEquipmentRules: [
          {
            serviceCode: 'Scheduled - Equipment - GPU-',
            includedForAds: true,
            unitPriceINR: 12206,
            uom: 'Per Hour',
            aircraftTypes: ['B738'],
            effectiveMonth: '2026-07',
          },
        ],
      },
      {
        serviceCode: 'ADS - Equipment - Ground Power Unit -90KV',
        particular: 'Ground Power Unit -90KV',
        equipmentName: 'Ground Power Unit - 90KV',
        aircraftType: 'B738',
        billingCurrency: 'INR',
        effectiveMonth: '2026-07',
      },
    );
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(12206);
  });

  it('ignores services misfiled as aircraft types when matching A320', () => {
    const priced = resolveAdsPricingFromContractRule(
      {
        adsBillingEnabled: true,
        aircraftTypes: ['A320', 'TOILET SERVICE', 'PAX-COACH', 'CREW COACH'],
        adsEquipmentRules: [
          {
            serviceCode: 'GPU-NB',
            includedForAds: true,
            unitPriceINR: 9000,
            uom: 'Per Hour',
            aircraftTypes: ['TOILET SERVICE', 'A320', 'ADDITIONAL MANPOWER'],
            effectiveMonth: '2026-08',
          },
        ],
      },
      {
        particular: 'GPU-90KV',
        equipmentName: 'GPU-90KV',
        aircraftType: 'A320',
        billingCurrency: 'INR',
        effectiveMonth: '2026-08',
      },
    );
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(9000);
  });

  it('still matches when legacy adsBillingEnabled is false (date range owns the contract)', () => {
    const priced = resolveAdsPricingFromContractRule(
      { ...ixContract, adsBillingEnabled: false },
      {
        particular: 'GPU-90KV',
        aircraftType: 'A320',
        billingCurrency: 'INR',
      },
    );
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(12206);
  });

  it('does not price Cones (C) from ACU-NB via substring match', () => {
    const priced = resolveAdsPricingFromContractRule(
      {
        ...ixContract,
        adsEquipmentRules: [
          {
            serviceCode: 'ACU-NB',
            includedForAds: true,
            unitPriceINR: 5000,
            uom: 'Per Hour',
            aircraftTypes: ['A320', 'A321'],
            effectiveMonth: '2026-06',
          },
        ],
      },
      {
        serviceCode: 'ADS - Equipment - Cones',
        particular: 'Cones',
        equipmentName: 'C',
        aircraftType: 'A320',
        billingCurrency: 'INR',
      },
    );
    expect(priced.matched).toBe(false);
    expect(priced.unitPrice).toBeNull();
  });

  it('uses contract ADS lines for any flight month (ignores stored effectiveMonth)', () => {
    const priced = resolveAdsPricingFromContractRule(
      {
        ...ixContract,
        adsEquipmentRules: [
          {
            serviceCode: 'GPU-NB',
            includedForAds: true,
            unitPriceINR: 100,
            uom: 'Per Hour',
            aircraftTypes: ['A320'],
            effectiveMonth: '2026-06',
          },
          {
            serviceCode: 'GPU-NB',
            includedForAds: true,
            unitPriceINR: 200,
            uom: 'Per Hour',
            aircraftTypes: ['A320'],
            effectiveMonth: '2026-07',
          },
        ],
      },
      {
        particular: 'GPU-90KV',
        aircraftType: 'A320',
        billingCurrency: 'INR',
        effectiveMonth: '2026-08',
      },
    );
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(200);

    const pricedMissing = resolveAdsPricingFromContractRule(ixContract, {
      particular: 'GPU-90KV',
      aircraftType: 'A320',
      billingCurrency: 'INR',
      effectiveMonth: '2026-08',
    });
    expect(pricedMissing.matched).toBe(true);
    expect(pricedMissing.unitPrice).toBe(12206);
  });

  it('still matches FHR MDL after unique catalog stores a prefixed representative code', () => {
    const priced = resolveAdsPricingFromContractRule(
      {
        adsBillingEnabled: true,
        aircraftTypes: ['A320'],
        adsEquipmentRules: [
          {
            serviceCode: 'Scheduled - Equipment - MDL',
            includedForAds: true,
            unitPriceINR: 900,
            uom: 'MIN',
            aircraftTypes: ['A320'],
            effectiveMonth: '2026-07',
          },
        ],
      },
      {
        particular: 'MDL',
        equipmentName: 'RAF - Equipment - MDL',
        aircraftType: 'A320',
        billingCurrency: 'INR',
        effectiveMonth: '2026-07',
      },
    );
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(900);
  });

  it('matches billing full forms to contract short codes', () => {
    expect(adsEquipmentLabelsMatch('Main Deck Loader', 'MDL')).toBe(true);
    expect(adsEquipmentLabelsMatch('Diesel Tractor', 'DT')).toBe(true);
    expect(adsEquipmentLabelsMatch('Cones', 'Scheduled - Equipment - C')).toBe(true);
    expect(adsEquipmentLabelsMatch('Customer Service Agent', 'CSA')).toBe(true);
    expect(
      adsEquipmentLabelsMatch(
        'Ground Power Unit - Narrow Body',
        'Scheduled - Equipment - GPU-90KV',
      ),
    ).toBe(true);
  });

  it('applies wheelchair FOC by advance aircraft body NB vs WB', () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['A320', 'B777'],
      adsEquipmentRules: [
        {
          serviceCode: 'WCHR',
          includedForAds: true,
          freePerFlight: 1,
          freePerFlightNb: 1,
          freePerFlightWb: 3,
          unitPriceINR: 500,
          uom: 'EA',
          aircraftTypes: ['A320', 'B777'],
          effectiveMonth: '2026-07',
        },
      ],
    };

    const nb = resolveAdsPricingFromContractRule(contract, {
      particular: 'WCHR',
      equipmentName: 'Wheel Chair -WCHR',
      aircraftType: 'A320',
      aircraftBody: 'NB',
      billingCurrency: 'INR',
      effectiveMonth: '2026-07',
    });
    expect(nb.matched).toBe(true);
    expect(nb.freePerFlight).toBe(1);

    const wb = resolveAdsPricingFromContractRule(contract, {
      particular: 'WCHR',
      equipmentName: 'Wheel Chair -WCHR',
      aircraftType: 'B777',
      aircraftBody: 'WB',
      billingCurrency: 'INR',
      effectiveMonth: '2026-07',
    });
    expect(wb.matched).toBe(true);
    expect(wb.freePerFlight).toBe(3);

    const inferredWb = resolveAdsPricingFromContractRule(contract, {
      particular: 'WCHR',
      aircraftType: 'B777',
      billingCurrency: 'INR',
      effectiveMonth: '2026-07',
    });
    expect(inferredWb.freePerFlight).toBe(3);

    const inferredNb = resolveAdsPricingFromContractRule(contract, {
      particular: 'WCHR',
      aircraftType: 'A320',
      billingCurrency: 'INR',
      effectiveMonth: '2026-07',
    });
    expect(inferredNb.freePerFlight).toBe(1);
    expect(nb.serviceCode).toBe(ADS_WCHR_S_PARTICULAR);

    const wchs = resolveAdsPricingFromContractRule(contract, {
      particular: 'WCHS',
      equipmentName: 'Wheel Chair -WCHS',
      aircraftType: 'A320',
      aircraftBody: 'NB',
      billingCurrency: 'INR',
      effectiveMonth: '2026-07',
    });
    expect(wchs.matched).toBe(true);
    expect(wchs.freePerFlight).toBe(1);
    expect(wchs.unitPrice).toBe(500);
    expect(wchs.serviceCode).toBe(ADS_WCHR_S_PARTICULAR);
  });

  it('matches B737-800 contract rules to the same airframe on the flight', () => {
    const priced = resolveAdsPricingFromContractRule(
      {
        adsBillingEnabled: true,
        aircraftTypes: ['B737-800'],
        adsEquipmentRules: [
          {
            serviceCode: 'Scheduled - Equipment - WCHR',
            includedForAds: true,
            alwaysChargeable: true,
            unitPriceINR: 494.29,
            uom: 'Per Service',
            aircraftTypes: ['B737-800'],
            category: 'Dom',
          },
        ],
      },
      {
        serviceCode: 'Scheduled Flight - WCHR',
        particular: 'Wheel Chair -WCHR',
        equipmentName: 'WCHR',
        aircraftType: 'B737-800',
        flightCategory: 'Domestic',
        billingCurrency: 'INR',
      },
    );
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(494.29);
  });

  it('prices GPU-180 from its own row and does not give that rate to other equipment', () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['B787-900'],
      adsEquipmentRules: [
        {
          serviceCode: 'Ground Power Unit-180KV',
          includedForAds: false,
          alwaysChargeable: true,
          unitPriceINR: 3301,
          uom: 'Per 15 Minutes',
          aircraftTypes: ['B787-900'],
        },
        {
          serviceCode: 'GPU-NB',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 3301,
          uom: 'Per 15 Minutes',
          aircraftTypes: ['B787-900'],
        },
      ],
    };
    const gpu = resolveAdsPricingFromContractRule(contract, {
      serviceCode: 'Scheduled - Equipment - GPU-NB',
      particular: 'Ground Power Unit-180KV',
      equipmentName: 'Ground Power Unit-180KV',
      aircraftType: 'B787-900',
      billingCurrency: 'INR',
    });
    expect(gpu.matched).toBe(true);
    expect(gpu.excluded).toBe(false);
    expect(gpu.alwaysChargeable).toBe(true);
    expect(gpu.unitPrice).toBe(3301);
    expect(gpu.uom).toBe('Per 15 Minutes');
    expect(gpu.serviceCode).toBe('Ground Power Unit-180KV');

    const belt = resolveAdsPricingFromContractRule(contract, {
      serviceCode: 'Scheduled - Equipment - GPU-NB',
      particular: 'Conveyor Belt Loader',
      equipmentName: 'Conveyor belt loader',
      aircraftType: 'B787-900',
      billingCurrency: 'INR',
    });
    expect(belt.matched).toBe(false);
    expect(belt.unitPrice).toBeNull();
  });

  it('prices FHR Wide Body GPU usage from a live 180KV contract rule', () => {
    const contract = {
      adsBillingEnabled: true,
      aircraftTypes: ['B787-900'],
      adsEquipmentRules: [
        {
          serviceCode: 'Ground Power Unit - 180KV',
          includedForAds: true,
          alwaysChargeable: true,
          unitPriceINR: 3176,
          uom: 'Per 15 Min',
          aircraftTypes: ['B787-900'],
        },
      ],
    };
    const priced = resolveAdsPricingFromContractRule(contract, {
      serviceCode: 'ADS - Equipment - Ground Power Unit - Wide Body',
      particular: 'Ground Power Unit - Wide Body',
      equipmentName: 'GPU-WB',
      aircraftType: 'B787-900',
      billingCurrency: 'INR',
    });
    expect(priced.matched).toBe(true);
    expect(priced.unitPrice).toBe(3176);
    expect(priced.serviceCode).toBe('Ground Power Unit - 180KV');
  });

  it('recognises BME equipment labels and keeps the toggle off unless explicitly true', () => {
    expect(isBmeAdsEquipmentLabel('Ground Power Unit (BME)')).toBe(true);
    expect(isBmeAdsEquipmentLabel('Air Conditioner Unit (BME)')).toBe(true);
    expect(isBmeAdsEquipmentLabel('Water Cart (BME)')).toBe(true);
    expect(isBmeAdsEquipmentLabel('GPU(BME)')).toBe(true);
    expect(isBmeAdsEquipmentLabel('Ground Power Unit - 140KV')).toBe(false);
    expect(isBmeAdsEquipmentLabel('Wheel Chair -WCHR')).toBe(false);
    expect(contractBillsBmeEquipment(undefined)).toBe(false);
    expect(contractBillsBmeEquipment({})).toBe(false);
    expect(contractBillsBmeEquipment({ billBmeEquipment: false })).toBe(false);
    expect(contractBillsBmeEquipment({ billBmeEquipment: true })).toBe(true);
  });
});

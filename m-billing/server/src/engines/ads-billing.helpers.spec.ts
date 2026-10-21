import {
  preparationInvoiceCategory,
  preparationInvoiceGroupKey,
  preparationListPeriodFilter,
  preparationPeriodBoundEnd,
  preparationPeriodBoundStart,
} from '../common/billing-invoice-period.util';
import { lookupAdhocRate, normalizeAdhocKey } from '../shared/ads-adhoc-tariff';
import { resolveAdsPackageFreeAllowance } from '../shared/rate-card-billing-scope';

describe('ADS billing helpers', () => {
  it('groups ADS prep separately from BHS', () => {
    const base = {
      customerCode: 'SG',
      billingPeriodStart: '2026-02-01',
      billingPeriodEnd: '2026-02-28',
    };
    expect(preparationInvoiceCategory('scheduled_flight')).toBe('BHS');
    expect(preparationInvoiceCategory('ads')).toBe('ADS');
    expect(preparationInvoiceCategory('equipment')).toBe('ADS');
    expect(preparationInvoiceGroupKey({ ...base, sourceType: 'scheduled_flight' })).toContain(
      '|BHS',
    );
    expect(preparationInvoiceGroupKey({ ...base, sourceType: 'ads' })).toContain('|ADS');
    expect(
      preparationInvoiceGroupKey({ ...base, sourceType: 'scheduled_flight' }),
    ).not.toEqual(preparationInvoiceGroupKey({ ...base, sourceType: 'ads' }));
    expect(
      preparationInvoiceGroupKey({
        ...base,
        sourceType: 'scheduled_flight',
        operationalSnapshot: { categoryOfFlight: 'Domestic' },
      }),
    ).not.toEqual(
      preparationInvoiceGroupKey({
        ...base,
        sourceType: 'scheduled_flight',
        operationalSnapshot: { categoryOfFlight: 'International' },
      }),
    );
  });

  it('looks up wheelchair adhoc rate from tariff', () => {
    const hit = lookupAdhocRate('Wheel Chair -WCHR', { domestic: true });
    expect(hit?.unitPrice).toBe(2289);
    expect(normalizeAdhocKey('Wheel Chair -WCHR')).toContain('wheel');
  });

  it('adhoc matches FHR catalog description (LDL)', () => {
    const hit = lookupAdhocRate('Lower Deck Loader', { domestic: true });
    expect(hit?.unitPrice).toBe(23268);
    expect(hit?.uom).toMatch(/hour/i);
  });

  it('ADS prep group stays separate from BHS for same customer/period', () => {
    const base = {
      customerCode: 'IX',
      billingPeriodStart: '2026-02-28',
      billingPeriodEnd: '2026-03-31',
    };
    expect(preparationInvoiceCategory('raf')).toBe('RAF');
    expect(preparationInvoiceCategory('custom')).toBe('CUSTOM');
    expect(preparationInvoiceCategory('maas')).toBe('MAAS');
    expect(preparationInvoiceGroupKey({ ...base, sourceType: 'custom' })).toContain('|CUSTOM');
    expect(
      preparationInvoiceGroupKey({ ...base, sourceType: 'custom' }),
    ).not.toEqual(preparationInvoiceGroupKey({ ...base, sourceType: 'ads' }));
  });

  it('inclusive package with no serviceCount is fully free on ADS', () => {
    const r = resolveAdsPackageFreeAllowance({
      hasInclusiveCard: true,
      inclusiveServiceCount: null,
      exclusiveServiceCount: null,
    });
    expect(r.fullyPackageIncluded).toBe(true);
    expect(r.freeAllowance).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('inclusive serviceCount becomes per-flight free allowance', () => {
    const r = resolveAdsPackageFreeAllowance({
      hasInclusiveCard: true,
      inclusiveServiceCount: 447,
      exclusiveServiceCount: 10,
    });
    expect(r.fullyPackageIncluded).toBe(false);
    expect(r.freeAllowance).toBe(447);
  });

  it('exclusive-only free allowance still applies', () => {
    const r = resolveAdsPackageFreeAllowance({
      hasInclusiveCard: false,
      exclusiveServiceCount: 12,
    });
    expect(r.fullyPackageIncluded).toBe(false);
    expect(r.freeAllowance).toBe(12);
  });

  it('hourly UOM never gets package free allowance', () => {
    const r = resolveAdsPackageFreeAllowance({
      hasInclusiveCard: true,
      inclusiveServiceCount: null,
      exclusiveServiceCount: 10,
      uom: 'Per Hour',
    });
    expect(r.fullyPackageIncluded).toBe(false);
    expect(r.freeAllowance).toBe(0);
  });

  it('HR catalog UOM is treated as hourly', () => {
    const r = resolveAdsPackageFreeAllowance({
      hasInclusiveCard: true,
      inclusiveServiceCount: 50,
      uom: 'HR',
    });
    expect(r.freeAllowance).toBe(0);
    expect(r.fullyPackageIncluded).toBe(false);
  });

  it('alwaysChargeable zeros free allowance even when inclusive', () => {
    const r = resolveAdsPackageFreeAllowance({
      hasInclusiveCard: true,
      inclusiveServiceCount: 5,
      exclusiveServiceCount: 2,
      alwaysChargeable: true,
    });
    expect(r.freeAllowance).toBe(0);
    expect(r.fullyPackageIncluded).toBe(false);
  });

  it('preparationListPeriodFilter uses inclusive UTC day bounds (list + create-drafts parity)', () => {
    const period = preparationListPeriodFilter('2026-07-01', '2026-07-31');
    expect(period?.$gte?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(period?.$lte?.toISOString()).toBe('2026-07-31T23:59:59.999Z');

    const julyStart = preparationPeriodBoundStart('2026-07-01');
    const julyEndAfternoon = new Date('2026-07-31T18:30:00.000Z');
    expect(julyEndAfternoon.getTime()).toBeGreaterThan(
      new Date('2026-07-31T00:00:00.000Z').getTime(),
    );
    expect(julyEndAfternoon.getTime()).toBeLessThanOrEqual(period!.$lte!.getTime());
    expect(julyStart.getTime()).toBeGreaterThanOrEqual(period!.$gte!.getTime());
  });
});

import { preparationSourceIdentity } from './preparation-source-identity.util';

describe('preparationSourceIdentity', () => {
  it('prefers usageRowId so ADS lines on same serial stay distinct', () => {
    expect(
      preparationSourceIdentity({
        sourceRef: { serialNo: '16746', usageRowId: '16746:0' },
        operationalData: { atdDate: '2026-03-01' },
      }),
    ).toBe('usage:16746:0');
    expect(
      preparationSourceIdentity({
        sourceRef: { serialNo: '16746', usageRowId: '16746:1' },
        operationalData: { atdDate: '2026-03-01' },
      }),
    ).toBe('usage:16746:1');
  });

  it('uses serial+date for scheduled flights without usageRowId', () => {
    expect(
      preparationSourceIdentity({
        sourceRef: { serialNo: '16746' },
        operationalData: { atdDate: '01/03/2026' },
      }),
    ).toBe('serial:16746|date:2026-03-01');
  });
});

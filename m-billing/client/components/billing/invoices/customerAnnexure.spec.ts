import { annexureCategoryForInvoice, savedAnnexureForInvoice } from './customerAnnexure';

describe('savedAnnexureForInvoice', () => {
  const annexures = {
    ads: { originalName: 'VS-ADS.pdf' },
    bhs: { originalName: 'VS-BHS.pdf' },
  };

  it('picks the file that matches the invoice category', () => {
    expect(annexureCategoryForInvoice('ads')).toBe('ADS');
    expect(savedAnnexureForInvoice('BHS', annexures)?.file.originalName).toBe('VS-BHS.pdf');
    expect(savedAnnexureForInvoice('ADS', annexures)?.category).toBe('ADS');
  });

  it('stays hidden for other categories and missing files', () => {
    expect(savedAnnexureForInvoice('RAF', annexures)).toBeNull();
    expect(savedAnnexureForInvoice('CUSTOM', annexures)).toBeNull();
    expect(savedAnnexureForInvoice('ADS', { bhs: annexures.bhs })).toBeNull();
  });
});

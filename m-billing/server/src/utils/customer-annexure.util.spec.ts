import {
  annexureDownloadName,
  annexureStorageField,
  isPdfAnnexure,
  parseCustomerAnnexureCategory,
  publicCustomerAnnexures,
} from './customer-annexure.util';

describe('customer-annexure.util', () => {
  it('accepts only ADS and BHS categories', () => {
    expect(parseCustomerAnnexureCategory('ads')).toBe('ADS');
    expect(parseCustomerAnnexureCategory(' BHS ')).toBe('BHS');
    expect(parseCustomerAnnexureCategory('RAF')).toBeNull();
    expect(annexureStorageField('ADS')).toBe('ads');
    expect(annexureStorageField('BHS')).toBe('bhs');
  });

  it('hides storage keys and empty files from the client', () => {
    expect(
      publicCustomerAnnexures({
        ads: { fileKey: 'billing-annexures/DEL/1/ads.pdf', originalName: 'VS-ADS.pdf' },
        bhs: { originalName: 'missing-file.pdf' },
      }),
    ).toEqual({ ads: { originalName: 'VS-ADS.pdf', uploadedAt: undefined } });
    expect(publicCustomerAnnexures(undefined)).toBeUndefined();
  });

  it('requires a PDF name and PDF header', () => {
    expect(
      isPdfAnnexure({
        buffer: Buffer.from('%PDF-1.4 annexure'),
        mimetype: 'application/pdf',
        originalname: 'annexure.pdf',
      }),
    ).toBe(true);
    expect(
      isPdfAnnexure({
        buffer: Buffer.from('not a pdf'),
        mimetype: 'application/pdf',
        originalname: 'annexure.pdf',
      }),
    ).toBe(false);
    expect(
      isPdfAnnexure({
        buffer: Buffer.from('%PDF-1.4'),
        mimetype: 'text/plain',
        originalname: 'notes.txt',
      }),
    ).toBe(false);
  });

  it('keeps a pdf file name and falls back otherwise', () => {
    expect(annexureDownloadName('Virgin ADS.pdf', 'VS', 'ADS')).toBe('Virgin ADS.pdf');
    expect(annexureDownloadName('notes', 'VS', 'BHS')).toBe('VS-BHS-annexure.pdf');
  });
});

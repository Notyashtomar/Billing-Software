import { formatBytes, formatMemoryFields } from './format-bytes.util';

describe('formatBytes', () => {
  it('formats sub-kilobyte values as Bytes', () => {
    expect(formatBytes(512)).toEqual({ bytes: 512, human: '512 Bytes' });
    expect(formatBytes(0)).toEqual({ bytes: 0, human: '0 Bytes' });
  });

  it('formats exact kilobytes without approximation prefix', () => {
    expect(formatBytes(1024)).toEqual({ bytes: 1024, human: '1 KB' });
  });

  it('formats megabyte-scale values for operators', () => {
    expect(formatBytes(141_049_856)).toEqual({
      bytes: 141_049_856,
      human: '~141 MB',
    });
    expect(formatBytes(71_761_792)).toEqual({
      bytes: 71_761_792,
      human: '~71 MB',
    });
  });

  it('formats gigabyte-scale values with one decimal when small', () => {
    expect(formatBytes(1_400_000_000).human).toBe('~1.4 GB');
  });

  it('normalizes negative and non-finite input to zero', () => {
    expect(formatBytes(-100).bytes).toBe(0);
    expect(formatBytes(Number.NaN).bytes).toBe(0);
  });
});

describe('formatMemoryFields', () => {
  it('maps each memory field through formatBytes', () => {
    const result = formatMemoryFields({ rss: 1024, heapUsed: 2048 });
    expect(result.rss).toEqual({ bytes: 1024, human: '1 KB' });
    expect(result.heapUsed).toEqual({ bytes: 2048, human: '2 KB' });
  });
});

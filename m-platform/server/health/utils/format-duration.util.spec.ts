import { formatDuration } from './format-duration.util';

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toEqual({ seconds: 45, human: '45s' });
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(194)).toEqual({ seconds: 194, human: '3m 14s' });
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toEqual({ seconds: 3661, human: '1h 1m 1s' });
  });

  it('omits zero trailing units when possible', () => {
    expect(formatDuration(7440)).toEqual({ seconds: 7440, human: '2h 4m' });
    expect(formatDuration(7200)).toEqual({ seconds: 7200, human: '2h' });
  });

  it('normalizes negative and non-finite input to zero', () => {
    expect(formatDuration(-10)).toEqual({ seconds: 0, human: '0s' });
    expect(formatDuration(Number.NaN)).toEqual({ seconds: 0, human: '0s' });
  });
});

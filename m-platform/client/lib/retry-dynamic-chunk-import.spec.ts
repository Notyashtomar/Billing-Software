import { isChunkLoadFailure, isStaleScriptElement } from './retry-dynamic-chunk-import';

describe('stale chunk detection', () => {
  it('recognises a missing Next chunk', () => {
    expect(isChunkLoadFailure(new Error('ChunkLoadError: Loading chunk 12 failed'))).toBe(true);
    expect(
      isChunkLoadFailure(new TypeError('Failed to fetch dynamically imported module')),
    ).toBe(true);
    expect(isChunkLoadFailure(new Error('Station not found'))).toBe(false);
  });

  it('ignores non-script targets when the DOM is absent', () => {
    expect(isStaleScriptElement(null)).toBe(false);
  });
});

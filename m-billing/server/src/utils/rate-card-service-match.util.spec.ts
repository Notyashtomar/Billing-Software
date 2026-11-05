import { serviceCodeContainsParticular } from './rate-card-service-match.util';

describe('serviceCodeContainsParticular', () => {
  it('does not treat a non-scheduled equipment card as the scheduled flight', () => {
    expect(
      serviceCodeContainsParticular('non scheduled flight - wchc', 'scheduled flight'),
    ).toBe(false);
    expect(
      serviceCodeContainsParticular('non scheduled flight - wchr', 'scheduled flight'),
    ).toBe(false);
  });

  it('still matches a longer name for the same service', () => {
    expect(serviceCodeContainsParticular('deep cleaning - nb', 'deep cleaning')).toBe(true);
  });
});

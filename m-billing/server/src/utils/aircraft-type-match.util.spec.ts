import {
  aircraftTokenMatchesFlight,
  normalizeFlightCategory,
  pickBestRateCardForFlight,
  rateCardMatchesFlightAircraft,
  rateCardMatchesFlightCategory,
} from './aircraft-type-match.util';

describe('aircraft-type-match.util', () => {
  it('matches B777F rate cards to IATA and hyphenated flight codes', () => {
    const card = { aircraftType: 'B777F', category: 'Int' };
    expect(rateCardMatchesFlightAircraft(card, 'B77F')).toBe(true);
    expect(rateCardMatchesFlightAircraft(card, 'B777-F')).toBe(true);
    expect(rateCardMatchesFlightAircraft(card, '77F')).toBe(true);
    expect(pickBestRateCardForFlight([card], 'B77F', 'International')?.aircraftType).toBe(
      'B777F',
    );
  });

  it('matches parent aircraft tokens inside flight equipment strings', () => {
    expect(aircraftTokenMatchesFlight('A320-800', 'A320')).toBe(true);
    expect(aircraftTokenMatchesFlight('B737/A320', 'A320')).toBe(true);
    expect(aircraftTokenMatchesFlight('B737/A320', 'B737')).toBe(true);
    expect(aircraftTokenMatchesFlight('B737 MAX-8', 'B737 MAX')).toBe(true);
    expect(aircraftTokenMatchesFlight('A321-200', 'A320')).toBe(false);
  });

  it('prefers the longest matching aircraft token', () => {
    const cards = [
      { aircraftType: 'B737', serviceCode: 'TRND', validFrom: '2026-01-01' },
      { aircraftType: 'B737 MAX', serviceCode: 'TRND', validFrom: '2026-01-01' },
    ];
    const picked = pickBestRateCardForFlight(cards, 'B737 MAX-8', 'Dom');
    expect(picked?.aircraftType).toBe('B737 MAX');
  });

  it('matches slash-separated legacy category bands', () => {
    const card = { category: 'A320/B737/B737MAX', serviceCode: 'Scheduled Flight' };
    expect(rateCardMatchesFlightAircraft(card, 'IX · A320-251N')).toBe(true);
    expect(rateCardMatchesFlightAircraft(card, 'B737-800')).toBe(true);
  });

  it('matches AF-style grouped aircraftType with slash tokens', () => {
    const card = { aircraftType: 'A330/A350/B777-200/B787', category: 'Int' };
    expect(rateCardMatchesFlightAircraft(card, 'B777-200')).toBe(true);
    expect(rateCardMatchesFlightAircraft(card, 'A330')).toBe(true);
    expect(rateCardMatchesFlightAircraft(card, 'B737-800')).toBe(false);
  });

  it('strips flight-count notes before matching grouped aircraft', () => {
    const card = {
      aircraftType: 'A330/A350/B777-200/B787 (Flight less than 35)',
      category: 'Dom',
    };
    expect(rateCardMatchesFlightAircraft(card, 'B777-200')).toBe(true);
  });

  it('resolves mixed domestic/international labels by departure side', () => {
    expect(normalizeFlightCategory('domestic-international')).toBe('Int');
    expect(normalizeFlightCategory('international-domestic')).toBe('Dom');
  });

  it('matches rate-card category using departure-side resolution', () => {
    const domesticCard = { category: 'Dom' };
    const internationalCard = { category: 'Int' };
    expect(
      rateCardMatchesFlightCategory(domesticCard, 'international-domestic'),
    ).toBe(true);
    expect(
      rateCardMatchesFlightCategory(internationalCard, 'domestic-international'),
    ).toBe(true);
  });
});

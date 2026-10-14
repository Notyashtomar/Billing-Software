import {
  SCHEDULE_SEASON,
  buildScheduleIdentityKey,
  compareScheduleDates,
  detectScheduleSeason,
  isValidScheduleFlightNo,
  isValidScheduleRouting,
  mergeScheduleValidityRange,
  pickExtendedValidTo,
  normalizeFlightNoForScheduleIdentity,
  normalizeRoutingForMatch,
  normalizeScheduleDayTimes,
  normalizeScheduleFlightNoForStorage,
  normalizeScheduleRoutingForStorage,
  displayFlightNoFromScheduleData,
  withAirlineCodePrefix,
  scheduleSaveSuccessMessage,
  tryDetectScheduleSeason,
  unionScheduleDays,
} from './schedule-season.util';

describe('schedule-season.util', () => {
  describe('detectScheduleSeason', () => {
    it('maps April–September Valid From to Summer', () => {
      expect(detectScheduleSeason('01/04/2026').season).toBe(
        SCHEDULE_SEASON.SUMMER,
      );
      expect(detectScheduleSeason('10/04/2026').seasonKey).toBe('summer-2026');
      expect(detectScheduleSeason('30/09/2026').seasonKey).toBe('summer-2026');
    });

    it('maps October–December Valid From to Winter starting that year', () => {
      expect(detectScheduleSeason('01/10/2026').season).toBe(
        SCHEDULE_SEASON.WINTER,
      );
      expect(detectScheduleSeason('20/10/2026').seasonKey).toBe('winter-2026');
      expect(detectScheduleSeason('31/12/2026').seasonKey).toBe('winter-2026');
    });

    it('maps January–March Valid From to Winter starting prior year', () => {
      expect(detectScheduleSeason('15/01/2027').seasonKey).toBe('winter-2026');
      expect(detectScheduleSeason('31/03/2027').seasonKey).toBe('winter-2026');
      expect(detectScheduleSeason('01/03/2026').seasonKey).toBe('winter-2025');
    });

    it('keeps Summer and Winter of same calendar year separate', () => {
      expect(detectScheduleSeason('01/04/2026').seasonKey).toBe('summer-2026');
      expect(detectScheduleSeason('01/10/2026').seasonKey).toBe('winter-2026');
    });

    it('throws on invalid Valid From', () => {
      expect(() => detectScheduleSeason('')).toThrow(/Valid From/);
      expect(() => detectScheduleSeason('not-a-date')).toThrow(/Valid From/);
    });

    it('tryDetect returns null for bad input', () => {
      expect(tryDetectScheduleSeason('')).toBeNull();
      expect(tryDetectScheduleSeason('99/99/9999')).toBeNull();
    });
  });

  describe('mergeScheduleValidityRange', () => {
    it('extends Valid To when adding a later month in same season', () => {
      const merged = mergeScheduleValidityRange(
        '01/04/2026',
        '30/04/2026',
        '01/05/2026',
        '31/05/2026',
      );
      expect(merged).toEqual({
        validFrom: '01/04/2026',
        validTo: '31/05/2026',
      });
    });

    it('pulls Valid From earlier when new range starts sooner', () => {
      const merged = mergeScheduleValidityRange(
        '01/05/2026',
        '31/05/2026',
        '01/04/2026',
        '30/04/2026',
      );
      expect(merged).toEqual({
        validFrom: '01/04/2026',
        validTo: '31/05/2026',
      });
    });

    it('handles adjacent ranges (30 Apr then 1 May)', () => {
      const merged = mergeScheduleValidityRange(
        '01/04/2026',
        '30/04/2026',
        '01/05/2026',
        '31/05/2026',
      );
      expect(merged.validFrom).toBe('01/04/2026');
      expect(merged.validTo).toBe('31/05/2026');
    });

    it('handles overlapping ranges', () => {
      const merged = mergeScheduleValidityRange(
        '01/04/2026',
        '31/05/2026',
        '15/05/2026',
        '30/06/2026',
      );
      expect(merged).toEqual({
        validFrom: '01/04/2026',
        validTo: '30/06/2026',
      });
    });
  });

  describe('unionScheduleDays', () => {
    it('ORs weekday flags', () => {
      const union = unionScheduleDays(
        { Mon: true, Wed: true, Fri: false },
        { Tue: true, Fri: true },
      );
      expect(union.Mon).toBe(true);
      expect(union.Tue).toBe(true);
      expect(union.Wed).toBe(true);
      expect(union.Fri).toBe(true);
      expect(union.Sun).toBe(false);
    });
  });

  describe('identity + messages', () => {
    it('builds stable identity keys', () => {
      expect(
        buildScheduleIdentityKey({
          seasonKey: 'summer-2026',
          airline: 'Air India',
          flightNo: 'ai101',
          routing: 'blr - maa - blr',
        }),
      ).toBe('summer-2026|air india|AI101|BLR-MAA-BLR');
    });

    it('normalizes flight numbers with spaces and dashes for identity', () => {
      expect(normalizeFlightNoForScheduleIdentity('ai 101')).toBe('AI101');
      expect(normalizeFlightNoForScheduleIdentity('AI-101')).toBe('AI101');
      expect(normalizeFlightNoForScheduleIdentity('AI101/AI102')).toBe('AI101AI102');
      expect(
        buildScheduleIdentityKey({
          seasonKey: 'summer-2026',
          airline: 'IndiGo',
          flightNo: '6e 101',
          routing: 'DEL-BOM',
        }),
      ).toBe(
        buildScheduleIdentityKey({
          seasonKey: 'summer-2026',
          airline: 'IndiGo',
          flightNo: '6E101',
          routing: 'DEL-BOM',
        }),
      );
    });

    it('stores flight no with slash preserved for display', () => {
      expect(normalizeScheduleFlightNoForStorage('ai101/ai102')).toBe('AI101/AI102');
      expect(normalizeScheduleFlightNoForStorage('AI 101')).toBe('AI101');
      expect(normalizeScheduleFlightNoForStorage('AK 39/38')).toBe('AK39/38');
      expect(isValidScheduleFlightNo('6E205')).toBe(true);
      expect(isValidScheduleFlightNo('AI101/AI102')).toBe(true);
      expect(isValidScheduleFlightNo('AI101/AI102/AI103')).toBe(false);
      expect(isValidScheduleFlightNo('/')).toBe(false);
    });

    it('keeps per-day STA/STD slots', () => {
      expect(
        normalizeScheduleDayTimes({
          Mon: { sta: '8:35', std: '09:15' },
          Tue: { sta: '', std: '10:00' },
          Fri: { sta: '21:55', std: '22:40' },
        }),
      ).toEqual({
        Mon: { sta: '08:35', std: '09:15' },
        Fri: { sta: '21:55', std: '22:40' },
      });
    });

    it('prefixes airline code onto numeric legs once', () => {
      expect(withAirlineCodePrefix('IX', '1089')).toBe('IX1089');
      expect(withAirlineCodePrefix('IX', 'IX1089')).toBe('IX1089');
      expect(withAirlineCodePrefix('', '1089')).toBe('1089');
    });

    it('shows schedule setup flight no when not split', () => {
      expect(
        displayFlightNoFromScheduleData({
          flightNo: 'IX1089',
          airlineCode: 'IX',
          ArrivalFltNo: '1089',
          DepartureFltNo: '1685',
          ifOperationSplit: false,
        }),
      ).toBe('IX1089');
    });

    it('keeps CANC prefix and hyphen, dropping only spaces', () => {
      expect(
        displayFlightNoFromScheduleData({
          flightNo: 'CANC -FD 196/197',
          airlineCode: 'FD',
          ArrivalFltNo: 'FD196',
          DepartureFltNo: 'FD197',
          ifOperationSplit: true,
        }),
      ).toBe('CANC-FD196/197');
    });

    it('shows code+arr/code+dep when operation split', () => {
      expect(
        displayFlightNoFromScheduleData({
          flightNo: '1089/1685',
          airlineCode: 'IX',
          ArrivalFltNo: '1089',
          DepartureFltNo: '1685',
          ifOperationSplit: true,
        }),
      ).toBe('IX1089/IX1685');
    });

    it('stores routing as 2 or 3 IATA codes', () => {
      expect(normalizeScheduleRoutingForStorage('del-ixc-del')).toBe('DEL-IXC-DEL');
      expect(isValidScheduleRouting('DEL-IXC')).toBe(true);
      expect(isValidScheduleRouting('DEL-IXC-DEL')).toBe(true);
      expect(isValidScheduleRouting('DEL')).toBe(false);
      expect(isValidScheduleRouting('DEL-IXC-BOM-MAA')).toBe(false);
      expect(isValidScheduleRouting('')).toBe(true);
    });

    it('normalizes routing dashes and spaces', () => {
      expect(normalizeRoutingForMatch('BLR – MAA')).toBe('BLR-MAA');
    });

    it('formats success messages', () => {
      expect(
        scheduleSaveSuccessMessage(SCHEDULE_SEASON.SUMMER, 'updated'),
      ).toBe('Summer schedule updated successfully.');
      expect(
        scheduleSaveSuccessMessage(SCHEDULE_SEASON.WINTER, 'created'),
      ).toBe('New Winter schedule created.');
    });

    it('compares dates chronologically', () => {
      expect(compareScheduleDates('01/05/2026', '30/04/2026')).toBeGreaterThan(
        0,
      );
    });

    it('extends Valid To only forward', () => {
      expect(pickExtendedValidTo('30/04/2026', '09/09/2027')).toBe(
        '09/09/2027',
      );
      expect(pickExtendedValidTo('', '09/09/2027')).toBe('09/09/2027');
      expect(pickExtendedValidTo('31/12/2027', '09/09/2027')).toBeNull();
      expect(pickExtendedValidTo('09/09/2027', '09/09/2027')).toBeNull();
    });
  });
});

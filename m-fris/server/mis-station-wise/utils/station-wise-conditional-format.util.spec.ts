import {
  parseCfNumeric,
  resolveStationWiseCellHighlight,
  STATION_WISE_CF_RULES,
  valueMatchesCfRule,
} from './station-wise-conditional-format.util';

describe('station-wise-conditional-format.util', () => {
  it('highlights GT bucket flag = 1', () => {
    expect(resolveStationWiseCellHighlight('BI', 1)).toEqual({
      backgroundColor: '#C6EFCE',
      color: '#006100',
      ruleId: 'gt-buckets-eq1',
    });
    expect(resolveStationWiseCellHighlight('BI', 0)).toBeNull();
    expect(resolveStationWiseCellHighlight('BI', '-')).toBeNull();
  });

  it('highlights OTP flags and final report when > 0', () => {
    expect(resolveStationWiseCellHighlight('CB', 1)?.ruleId).toBe('otp-flags-gt0');
    expect(resolveStationWiseCellHighlight('DW', '1')?.ruleId).toBe('final-report-gt0');
    expect(resolveStationWiseCellHighlight('DC', 1)?.backgroundColor).toBe('#FEFFCD');
    expect(resolveStationWiseCellHighlight('EJ', 1)?.color).toBe('#800080');
  });

  it('highlights GT ADDED text on BH', () => {
    expect(resolveStationWiseCellHighlight('BH', 'GT ADDED')?.ruleId).toBe('gt-added');
    expect(resolveStationWiseCellHighlight('BH', 0.012)).toBeNull();
  });

  it('parses numeric display strings', () => {
    expect(parseCfNumeric('-')).toBeNull();
    expect(parseCfNumeric('0')).toBe(0);
    expect(parseCfNumeric('1')).toBe(1);
    expect(valueMatchesCfRule(1, STATION_WISE_CF_RULES[0]!)).toBe(true);
  });
});

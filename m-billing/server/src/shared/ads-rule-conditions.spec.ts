import {
  adsFlightContextFromFhr,
  adsRulesNeedFlightContext,
  adsStandbyChargePercent,
  isAdsStandbyRemark,
  isPerTurnaroundEquipmentUom,
  parseAdsRuleConditions,
  scheduledGroundMinutes,
} from './ads-rule-conditions';
import { classifyStationBay } from './station-bay-types';

describe('ADS rule conditions from the contract remark', () => {
  it('reads the scheduled-ground-time, bay and monthly-pool wording', () => {
    expect(parseAdsRuleConditions('FOC for SGT time')).toEqual({
      sgtFree: true,
      focBay: null,
      monthlyFreePool: null,
      onRequestOnly: false,
    });
    expect(parseAdsRuleConditions('Charged on request only').onRequestOnly).toBe(true);
    expect(parseAdsRuleConditions('FOC for SGT Time').sgtFree).toBe(true);
    expect(parseAdsRuleConditions('FOC for Remote Bay').focBay).toBe('remote');
    expect(parseAdsRuleConditions('FOC for Contact bay').focBay).toBe('contact');
    expect(parseAdsRuleConditions('FOC for Remote Bay CYI:KU-DEL-SGHA:2026-04-01:5%x1').focBay).toBe(
      'remote',
    );
  });

  it('takes only the count from "900 Per month based on double daily flights"', () => {
    expect(
      parseAdsRuleConditions('900 Per month based on double daily flights').monthlyFreePool,
    ).toBe(900);
    expect(parseAdsRuleConditions('900 per month').monthlyFreePool).toBe(900);
  });

  it('leaves other remarks alone', () => {
    for (const remark of [
      '',
      'Remote bay only.',
      'At remote bay only.',
      '1 unit included for remote bay operations and chargeable only if exceeds SGT by more than 30 minutes.',
      'PH — PSL-BEYOND SGT',
      '150 non-cumulative based on 9 flights per week',
      '7*no.of flights per month',
      '10 ULD stored free. LD3 thereafter USD 81 per ULD per month on mode.',
      'Two hours included per month.',
    ]) {
      expect(parseAdsRuleConditions(remark)).toEqual({
        sgtFree: false,
        focBay: null,
        monthlyFreePool: null,
        onRequestOnly: false,
      });
    }
    expect(adsRulesNeedFlightContext([{ remarks: 'Remote bay only.' }, {}])).toBe(false);
    expect(adsRulesNeedFlightContext([{ remarks: 'FOC for SGT time' }])).toBe(true);
  });

  it('recognises standby remarks written on the flight report', () => {
    for (const remark of [
      '00:15 (STAND BY ON DEP)',
      '00:00 STAND-BY',
      '00:25 dep STBY',
      '00:31 01 Kept for standby',
      '01:00(PUSH BACK STAND BY BAY 245)',
    ]) {
      expect(isAdsStandbyRemark(remark)).toBe(true);
    }
    expect(isAdsStandbyRemark('00:47')).toBe(false);
    expect(isAdsStandbyRemark('02 TRIP')).toBe(false);
  });

  it('uses the contract standby percent only when it is a part-charge', () => {
    expect(adsStandbyChargePercent({ conditionalCharges: { standbyChargesPercent: 50 } })).toBe(50);
    expect(adsStandbyChargePercent({ conditionalCharges: { standbyChargesPercent: 0 } })).toBeNull();
    expect(adsStandbyChargePercent({ conditionalCharges: { standbyChargesPercent: 100 } })).toBeNull();
    expect(adsStandbyChargePercent({ conditionalCharges: {} })).toBeNull();
    expect(adsStandbyChargePercent(null)).toBeNull();
  });

  it('knows a per-turnaround equipment unit from a per-person one', () => {
    expect(isPerTurnaroundEquipmentUom('Per Turnaround')).toBe(true);
    expect(isPerTurnaroundEquipmentUom('Per turn around')).toBe(true);
    expect(isPerTurnaroundEquipmentUom('Per Trip')).toBe(false);
    expect(isPerTurnaroundEquipmentUom('Per Personnel Per Turnaround')).toBe(false);
    expect(isPerTurnaroundEquipmentUom('Per Trained Staff Per Turnaround')).toBe(false);
  });

  it('measures scheduled ground time from STA to STD', () => {
    expect(
      scheduledGroundMinutes({
        STADate: '28/10/2026',
        STATime: '02:40',
        STDDate: '28/10/2026',
        STDTime: '03:20',
      }),
    ).toBe(40);
    // Overnight stay.
    expect(
      scheduledGroundMinutes({
        STADate: '2026-09-01',
        STATime: '23:30',
        STDDate: '2026-09-02',
        STDTime: '01:00',
      }),
    ).toBe(90);
    expect(scheduledGroundMinutes({ STADate: '28/10/2026', STATime: '02:40' })).toBeNull();
    expect(
      scheduledGroundMinutes({
        STADate: '28/10/2026',
        STATime: '03:20',
        STDDate: '28/10/2026',
        STDTime: '02:40',
      }),
    ).toBeNull();
  });

  it('builds the flight context from the flight report', () => {
    expect(
      adsFlightContextFromFhr(
        {
          stationCode: 'DEL',
          mainDetails: {
            STADate: '01/09/2026',
            STATime: '10:00',
            STDDate: '01/09/2026',
            STDTime: '11:30',
          },
          rampDetails1: { BayPlanned: 'A08', BayFinal: 'R-04' },
        },
        'DEL',
      ),
    ).toEqual({ bayNo: 'R-04', bayType: 'remote', sgtMinutes: 90 });
    // Planned bay is used when the final bay was not entered.
    expect(
      adsFlightContextFromFhr({ rampDetails1: { BayPlanned: 'A08', BayFinal: '' } }, 'DEL').bayType,
    ).toBe('contact');
  });
});

describe('station bay types (Bay Details workbook)', () => {
  it('classifies Delhi bays however the flight report writes them', () => {
    for (const bay of ['A08', 'A-08 R', 'a8r', 'A 01', 'B19L', 'B-26', 'C27R', 'C-28L', 'D62']) {
      expect(classifyStationBay('DEL', bay)).toBe('contact');
    }
    for (const bay of ['101', '122', '201', '208', '211']) {
      expect(classifyStationBay('DEL', bay)).toBe('contact');
    }
    for (const bay of ['R-04', 'R02L', 'R-02 L', 'R12', 'E64', 'E84']) {
      expect(classifyStationBay('DEL', bay)).toBe('remote');
    }
    for (const bay of ['148', '149A', '160L', '133R', '203', '210', '246', '252', '265']) {
      expect(classifyStationBay('DEL', bay)).toBe('remote');
    }
  });

  it('uses the first bay when two are written', () => {
    expect(classifyStationBay('DEL', 'B19R/R04')).toBe('contact');
    expect(classifyStationBay('DEL', 'R04/B19R')).toBe('remote');
  });

  it('returns null for a blank bay, a bay outside the workbook, or another station', () => {
    expect(classifyStationBay('DEL', '')).toBeNull();
    expect(classifyStationBay('DEL', 'A14')).toBeNull();
    expect(classifyStationBay('DEL', 'E8')).toBeNull();
    expect(classifyStationBay('DEL', '258')).toBeNull();
    expect(classifyStationBay('MAA', '12')).toBeNull();
  });

  it('classifies Imphal, Agartala and Trichy bays', () => {
    expect(classifyStationBay('IMF', '02')).toBe('remote');
    expect(classifyStationBay('IXA', '6')).toBe('remote');
    expect(classifyStationBay('IXA', '09')).toBe('contact');
    expect(classifyStationBay('TRZ', '16')).toBe('contact');
    expect(classifyStationBay('TRZ', '20')).toBe('remote');
    expect(classifyStationBay('TRZ', '13')).toBeNull();
  });
});

import {
  AIRLINE_REMARKS_BLANK_LABEL,
  AIRLINE_REMARKS_RATING_VALUES,
  isAirlineRemarksRating,
} from '../../remarks/remarks-rating.constants';
import {
  toExcelRatingValue,
  remarksMonthSheetName,
  airRepFromDoc,
  airRepRemFromDoc,
} from './remarks-map-fhr.util';
import {
  buildAirlineSummaries,
  buildRemarksModel,
  summarizeAirline,
} from './remarks-layout.util';
import type { RemarksFlightRow } from './remarks-map-fhr.util';
import type { CalendarMonthSlice } from './station-wise-months.util';

describe('remarks-map-fhr.util', () => {
  it('maps Not Satisfactory to Excel Not satisfactory', () => {
    expect(toExcelRatingValue('Not Satisfactory')).toBe('Not satisfactory');
    expect(toExcelRatingValue('Satisfactory')).toBe('Satisfactory');
    expect(toExcelRatingValue('')).toBe('');
  });

  it('names March sheet MARCH26', () => {
    expect(remarksMonthSheetName(2026, 2)).toBe('MARCH26');
    expect(remarksMonthSheetName(2026, 0)).toBe('JAN26');
  });

  it('reads airrep and AirRepRem as separate FHR keys', () => {
    const rem = {
      airrep: 'Mr. Balaji',
      AirRepRem: 'cabin cleaning team completed',
    };
    const doc = { remarks: rem, mainDetails: {} };
    expect(airRepFromDoc(rem, doc)).toBe('Mr. Balaji');
    expect(airRepRemFromDoc(rem, doc)).toBe('cabin cleaning team completed');
    expect(airRepFromDoc({ AirRepRem: 'Mr. Ramesh in remarks' }, {})).toBe('');
    expect(airRepRemFromDoc({ airrep: 'Mr. Balaji' }, {})).toBe('');
  });

  it('reads airrep from mainDetails when remarks.airrep is empty', () => {
    expect(airRepFromDoc(null, { mainDetails: { airrep: 'Nisha' } })).toBe(
      'Nisha',
    );
    expect(
      airRepFromDoc(null, {
        signatures: { airlineRepresentativeName: 'Mr. Gopi' },
      }),
    ).toBe('');
  });

  it('keeps Mongo rating enum aligned', () => {
    expect(AIRLINE_REMARKS_RATING_VALUES).toContain('Not Satisfactory');
    expect(isAirlineRemarksRating('Good')).toBe(true);
    expect(AIRLINE_REMARKS_BLANK_LABEL).toBe('Blanks');
  });
});

describe('remarks-layout.util', () => {
  const sample: RemarksFlightRow[] = [
    {
      serialNo: 1,
      airline: 'SpiceJet',
      airlineCode: 'SG',
      flightNo: 'SG1',
      typeCraft: 'B738',
      ataTime: '10:00',
      ataDate: '01/01/2026',
      airRep: 'Mr Gopi',
      airRepRem: 'staff short',
      ratingValue: 'Satisfactory',
      staYmd: '2026-01-01',
    },
    {
      serialNo: 2,
      airline: 'SpiceJet',
      airlineCode: 'SG',
      flightNo: 'SG2',
      typeCraft: 'B738',
      ataTime: '11:00',
      ataDate: '01/01/2026',
      airRep: '',
      airRepRem: '',
      ratingValue: 'Good',
      staYmd: '2026-01-01',
    },
    {
      serialNo: 3,
      airline: 'Air India Express',
      airlineCode: 'IX',
      flightNo: 'IX1',
      typeCraft: 'A320',
      ataTime: '12:00',
      ataDate: '02/01/2026',
      airRep: 'Nisha',
      airRepRem: '',
      ratingValue: '',
      staYmd: '2026-01-02',
    },
  ];

  it('aggregates airline summary counts', () => {
    const { airlines, totals } = buildAirlineSummaries(sample);
    expect(totals.fltCount).toBe(3);
    expect(totals.arlComnt).toBe(1);
    expect(totals.satisfactory).toBe(1);
    expect(totals.good).toBe(1);
    expect(totals.blanks).toBe(1);
    expect(airlines).toHaveLength(2);
    const sg = summarizeAirline('SpiceJet', sample.filter((r) => r.airline === 'SpiceJet'));
    expect(sg.fltCount).toBe(2);
    expect(sg.comntPct).toBeCloseTo(0.5);
  });

  it('builds month model with MARCH sheet name', () => {
    const months: CalendarMonthSlice[] = [
      {
        key: '2026-03',
        sheetName: 'MAR26',
        label: 'March 2026',
        from: '2026-03-01',
        to: '2026-03-31',
      },
    ];
    const row: RemarksFlightRow = {
      ...sample[0],
      staYmd: '2026-03-05',
      ataDate: '05/03/2026',
    };
    const model = buildRemarksModel(
      months,
      new Map([['2026-03', [row]]]),
      [row],
    );
    expect(model.months[0].sheetName).toBe('MARCH26');
    expect(model.months[0].flightCount).toBe(1);
    expect(model.ratingPreview.some((p) => p.key === 'satisfactory')).toBe(true);
  });
});

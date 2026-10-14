import {
  buildConcessionPatchBody,
  clearAllConcessionsPatchBody,
  emptyConcessionRatesForm,
  parseConcessionRatesForm,
  parseConditionalChargesForm,
} from '../contract-concessions';
import { CONTRACT_CONDITIONAL_CHARGE_SCENARIOS, CONTRACT_FEE_CONCESSION_SCENARIOS } from '../enums';

describe('emptyConcessionRatesForm', () => {
  it('initializes every concession scenario as an empty string', () => {
    const form = emptyConcessionRatesForm();
    for (const scenario of [
      ...CONTRACT_FEE_CONCESSION_SCENARIOS,
      ...CONTRACT_CONDITIONAL_CHARGE_SCENARIOS,
    ]) {
      expect(form[scenario]).toBe('');
      expect(() => String(form[scenario] ?? '').trim()).not.toThrow();
    }
    expect(form.delayChargesPercent).toBe('');
  });
});

describe('parseConcessionRatesForm', () => {
  it('ignores missing scenario keys without throwing', () => {
    const partial = { int: '10' } as ReturnType<typeof emptyConcessionRatesForm>;
    expect(parseConcessionRatesForm(partial)).toEqual({ int: 10 });
  });
});

describe('buildConcessionPatchBody', () => {
  it('always includes concessionRates and clears ceiling with null', () => {
    const form = emptyConcessionRatesForm();
    form.int = '18';
    expect(
      buildConcessionPatchBody({ values: form, ceilingInr: '38130', ceilingUsd: '' }),
    ).toEqual({
      concessionRates: { int: 18 },
      royaltyAtGross: 18,
      ceilingRatePerFlightINR: 38130,
      ceilingRatePerFlightUSD: null,
    });
  });
});

describe('clearAllConcessionsPatchBody', () => {
  it('clears rates, royalty, and ceilings', () => {
    expect(clearAllConcessionsPatchBody()).toEqual({
      concessionRates: {},
      royaltyAtGross: 0,
      ceilingRatePerFlightINR: null,
      ceilingRatePerFlightUSD: null,
    });
  });
});

describe('parseConditionalChargesForm', () => {
  it('ignores missing scenario keys without throwing', () => {
    const partial = { delayChargesPercent: '25' } as ReturnType<typeof emptyConcessionRatesForm>;
    expect(parseConditionalChargesForm(partial)).toEqual({ delayChargesPercent: 25 });
  });
});

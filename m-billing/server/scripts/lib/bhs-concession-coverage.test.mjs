import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyBhsConcessionCoverage } from './bhs-concession-coverage.mjs';

test('BHS inclusive note is comprehensive even when ADS excludes concession', () => {
  const result = classifyBhsConcessionCoverage([
    'All Rates are excluding concession fee (ADS) and BHS rate inclusive of concession',
    'A320/A321 (exc.royalty)',
    'A320/A321 (inc.royalty)',
  ]);
  assert.equal(result?.coverage, 'comprehensive');
});

test('basic handling included and additional excluded is comprehensive', () => {
  const result = classifyBhsConcessionCoverage([
    'Basic Rate included concession fee & Additional Rates are excluding concession fee',
    'Basic Handling Rate including',
    'Additional Services Rate excluding',
  ]);
  assert.equal(result?.coverage, 'comprehensive');
});

test('BHS excluding concession is non-comprehensive', () => {
  const result = classifyBhsConcessionCoverage([
    'BHS Rate are excluding concession fee And Additional Service Rate are Including concession fee',
    'All Basic Handling Rates are excluding and Additional services are including concession',
    'All Rates are excluding concession fee:',
  ]);
  assert.equal(result?.coverage, 'non_comprehensive');
});

test('comprehensive handling package name does not override an exclusive concession note', () => {
  const result = classifyBhsConcessionCoverage([
    'Comprehensive Handling Charges',
    'The above rates are exclusive of airport royalty/concession fees and applicable GST',
  ]);
  assert.equal(result?.coverage, 'non_comprehensive');
});

test('inclusive concession note is comprehensive', () => {
  const result = classifyBhsConcessionCoverage([
    'All Rates are including concession fee:',
    'The above prices are inclusive of Concession Fees/Royalties payable to the Airport Operator',
  ]);
  assert.equal(result?.coverage, 'comprehensive');
});

test('scheduled inclusive and non-scheduled exclusive is mixed', () => {
  const result = classifyBhsConcessionCoverage([
    'NSO: All above rates are exclusive of Concession Fee.',
    'SKD: All above rates are inclusive of Concession Fee.',
  ]);
  assert.equal(result?.coverage, 'mixed');
});

test('royalty working sheet bills the applicable rate that already includes royalty', () => {
  const result = classifyBhsConcessionCoverage([
    'Less: Royalty on Ceiling valid till 31 March 15',
    'Net of Royalty',
    'Add: Royalty on Ceiling valid till 31 March 27',
    'Applicable Rate Valid till 31 March 2027',
    'Including 13 % royalty',
    'Excluding 13 % Royalty',
  ]);
  assert.equal(result?.coverage, 'comprehensive');
});

test('exclusive of GST does not cancel an inclusive concession note', () => {
  const result = classifyBhsConcessionCoverage([
    '*Above Rates are inclusive of the Concession fee and exclusive of GST.',
    'The charges mentioned under sub Paragraph. 2.1 are inclusive of concession fee & exclusive of applicable service taxes.',
    'All the basic handling rates are inclusive of Concession Fees / Royalty and ADS rates are exclusive of Concession Fees / Royalty',
  ]);
  assert.equal(result?.coverage, 'comprehensive');
});

test('sheet with no concession note stays unmarked', () => {
  assert.equal(classifyBhsConcessionCoverage(['SGHA w.e.f. 15/05/2025', 'GPU 5 hrs']), null);
});

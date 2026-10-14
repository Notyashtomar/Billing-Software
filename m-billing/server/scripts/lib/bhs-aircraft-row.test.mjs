import assert from 'node:assert/strict';
import test from 'node:test';
import { expandBhsAircraftLabel } from './bhs-aircraft-row.mjs';

test('splits a shared narrow-body header into one type per row', () => {
  assert.deepEqual(expandBhsAircraftLabel('A319/A320/A321/B737'), {
    aircraft: ['A319', 'A320', 'A321', 'B737'],
    condition: '',
  });
});

test('keeps a single aircraft label unchanged', () => {
  assert.deepEqual(expandBhsAircraftLabel('B787-900-1st Flight').aircraft, ['B787-900-1st Flight']);
});

test('turns variant suffixes into their own type names', () => {
  assert.deepEqual(expandBhsAircraftLabel('B737-700/800/Max').aircraft, [
    'B737-700',
    'B737-800',
    'B737-MAX',
  ]);
  assert.deepEqual(expandBhsAircraftLabel('A320/ CEO/NEO').aircraft, ['A320-CEO', 'A320-NEO']);
});

test('treats Dash 8 / Q400 as one type', () => {
  assert.deepEqual(expandBhsAircraftLabel('Dash8/Q400').aircraft, ['Q400']);
  assert.deepEqual(expandBhsAircraftLabel('DASH8/400').aircraft, ['Q400']);
});

test('moves parenthetical conditions off the aircraft name', () => {
  assert.deepEqual(expandBhsAircraftLabel('A320/A321 (exc.royalty)'), {
    aircraft: ['A320', 'A321'],
    condition: 'exc.royalty',
  });
  assert.deepEqual(expandBhsAircraftLabel('B777F/B747F [LIFO/FILO]'), {
    aircraft: ['B777F', 'B747F'],
    condition: 'LIFO/FILO',
  });
});

test('keeps a combi code and a bracket-only slash on one type', () => {
  assert.deepEqual(expandBhsAircraftLabel('B777-300/B747/B74C').aircraft, [
    'B777-300',
    'B747',
    'B74C',
  ]);
  assert.deepEqual(expandBhsAircraftLabel('A330F [LIFO/FILO]').aircraft, ['A330F [LIFO/FILO]']);
});

test('splits wide-body groups and a trailing model suffix', () => {
  assert.deepEqual(
    expandBhsAircraftLabel('A330/A350/B777-200/B787-800/900/B777-200ER').aircraft,
    ['A330', 'A350', 'B777-200', 'B787-800', 'B787-900', 'B777-200ER'],
  );
});

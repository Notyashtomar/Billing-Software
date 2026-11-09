import {
  classifyFlightScenarioFromText,
  flightScenarioLabel,
  readStoredFlightScenario,
} from './flight-scenario.util';
import {
  classifyFlightScenarioForPreparation,
  inferConcessionScenarioFromLine,
  resolveLineConcessionPercent,
  resolveLineFlightScenario,
} from './invoice-concession.util';

describe('flight scenario field', () => {
  it('reads a stored scenario and tolerates UI label spellings', () => {
    expect(readStoredFlightScenario({ flightScenario: 'diverted' })).toBe('diverted');
    expect(readStoredFlightScenario({ flightScenario: 'Return to ramp' })).toBe('returnToRamp');
    expect(readStoredFlightScenario({ flightScenario: 'RTR' })).toBe('returnToRamp');
    expect(readStoredFlightScenario({ flightScenario: 'Technical landing' })).toBe('technical');
    expect(readStoredFlightScenario({ flightScenario: '' })).toBeNull();
    expect(readStoredFlightScenario({ flightScenario: 'garbage' })).toBeNull();
    expect(readStoredFlightScenario({})).toBeNull();
    expect(readStoredFlightScenario(null, { flightScenario: 'standby' })).toBe('standby');
  });

  it('classifies from text with diverted > return to ramp > technical > standby', () => {
    const base = { handlingCorpus: '', categoryLower: '', snap: {} };
    expect(classifyFlightScenarioFromText({ ...base, allText: 'additional' })).toBe('normal');
    expect(classifyFlightScenarioFromText({ ...base, allText: 'diverted flight rtr' })).toBe(
      'diverted',
    );
    expect(classifyFlightScenarioFromText({ ...base, allText: 'return to ramp' })).toBe(
      'returnToRamp',
    );
    expect(
      classifyFlightScenarioFromText({ ...base, allText: '', handlingCorpus: 'technical landing' }),
    ).toBe('technical');
    expect(
      classifyFlightScenarioFromText({ ...base, allText: '', handlingCorpus: 'stand-by' }),
    ).toBe('standby');
    expect(flightScenarioLabel('returnToRamp')).toBe('Return to ramp');
  });

  it('prefers the stored scenario over free text on the invoice line', () => {
    const contract = {
      conditionalCharges: { returnToRamp: 50, divertedDom: 25 },
    } as never;
    // Text says diverted, but the stored field says return to ramp.
    const stored = {
      sourceRef: {
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          typeOfFlight: 'Diverted Flight',
          flightScenario: 'returnToRamp',
        },
      },
    };
    expect(resolveLineFlightScenario(stored)).toBe('returnToRamp');
    expect(resolveLineConcessionPercent(stored, contract)).toBe(50);
    expect(inferConcessionScenarioFromLine(stored, contract)).toBe('ReturnToRamp');

    // No stored field → legacy text fallback still works.
    const legacy = {
      sourceRef: {
        operationalSnapshot: { categoryOfFlight: 'Domestic', typeOfFlight: 'Diverted Flight' },
      },
    };
    expect(resolveLineFlightScenario(legacy)).toBe('diverted');
    expect(resolveLineConcessionPercent(legacy, contract)).toBe(25);

    // Stored "normal" switches the text heuristics off completely.
    const normal = {
      sourceRef: {
        operationalSnapshot: {
          categoryOfFlight: 'Domestic',
          typeOfFlight: 'Diverted Flight',
          flightScenario: 'normal',
        },
      },
    };
    expect(resolveLineConcessionPercent(normal, contract)).toBe(0);
  });

  it('re-derives the scenario from source text when a record is prepared, ignoring a stale value', () => {
    expect(
      classifyFlightScenarioForPreparation({
        sourceRef: { serialNo: '1' },
        operationalData: { typeOfFlight: 'Return to Ramp', flightScenario: 'diverted' },
      }),
    ).toBe('returnToRamp');
    expect(
      classifyFlightScenarioForPreparation({
        operationalData: { typeOfHandling: 'Turnaround', categoryOfFlight: 'Domestic' },
      }),
    ).toBe('normal');
  });
});

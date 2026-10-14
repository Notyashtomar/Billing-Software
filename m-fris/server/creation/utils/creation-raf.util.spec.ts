import {
  buildCreationRafScheduleId,
  CREATION_RAF_SCHEDULE_ID_PREFIX,
  CREATION_RAF_SCHEDULE_SOURCE,
  isCreationRafScheduleId,
  isCreationRafScheduleSource,
} from './creation-raf.util';

describe('creation-raf.util', () => {
  it('builds stable RAF schedule ids', () => {
    expect(
      buildCreationRafScheduleId({
        airline: 'Air India',
        flightNo: 'AI2818',
        operationDateDdMmYyyy: '02/07/2026',
      }),
    ).toBe(`${CREATION_RAF_SCHEDULE_ID_PREFIX}20260702|air india|AI2818`);
  });

  it('detects RAF schedule markers', () => {
    const id = `${CREATION_RAF_SCHEDULE_ID_PREFIX}20260702|air india|AI2818`;
    expect(isCreationRafScheduleId(id)).toBe(true);
    expect(isCreationRafScheduleSource(CREATION_RAF_SCHEDULE_SOURCE)).toBe(true);
    expect(isCreationRafScheduleSource('advance_schedule_setup')).toBe(false);
  });
});

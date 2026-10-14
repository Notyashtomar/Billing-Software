import {
  PAX_SHIFT_REPORT_VIEW_KEY,
  clearPaxShiftSessionScratch,
  paxShiftEmployeeStorageKey,
  paxShiftFlightHandlingStorageKey,
  readPaxShiftReportViewFlight,
  retainPaxShiftSessionForSerial,
  stashPaxShiftReportViewFlight,
} from './paxShiftReportStorageKeys';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function flight(slNo: string) {
  return { slNo, flightNo: slNo, airline: 'AI' } as Parameters<typeof stashPaxShiftReportViewFlight>[0];
}

describe('pax shift session scratch', () => {
  it('keeps one report flight and drops the previous serial', () => {
    const storage = new MemoryStorage();
    storage.setItem(paxShiftFlightHandlingStorageKey('100'), '{"gate":"1"}');
    storage.setItem(paxShiftEmployeeStorageKey('100', 'sick-leave'), '[]');
    storage.setItem('fris-pax-shift-report-view-flight-100', '{"slNo":"100"}');
    storage.setItem('unrelated', 'keep');

    expect(stashPaxShiftReportViewFlight(flight('100'), storage)).toBe(true);
    expect(stashPaxShiftReportViewFlight(flight('200'), storage)).toBe(true);

    expect(readPaxShiftReportViewFlight('200', storage)?.slNo).toBe('200');
    expect(readPaxShiftReportViewFlight('100', storage)).toBeNull();
    expect(storage.getItem(PAX_SHIFT_REPORT_VIEW_KEY)).toContain('"slNo":"200"');
    expect(storage.getItem(paxShiftFlightHandlingStorageKey('100'))).toBeNull();
    expect(storage.getItem(paxShiftEmployeeStorageKey('100', 'sick-leave'))).toBeNull();
    expect(storage.getItem('fris-pax-shift-report-view-flight-100')).toBeNull();
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(storage.length).toBe(2);
  });

  it('keeps the open flight drafts and removes the other flight', () => {
    const storage = new MemoryStorage();
    storage.setItem(paxShiftFlightHandlingStorageKey('100'), 'a');
    storage.setItem(paxShiftEmployeeStorageKey('100', 'absence'), 'a');
    storage.setItem(paxShiftFlightHandlingStorageKey('200'), 'b');
    storage.setItem(paxShiftEmployeeStorageKey('200', 'absence'), 'b');

    retainPaxShiftSessionForSerial('200', storage);

    expect(storage.getItem(paxShiftFlightHandlingStorageKey('200'))).toBe('b');
    expect(storage.getItem(paxShiftEmployeeStorageKey('200', 'absence'))).toBe('b');
    expect(storage.getItem(paxShiftFlightHandlingStorageKey('100'))).toBeNull();
    expect(storage.getItem(paxShiftEmployeeStorageKey('100', 'absence'))).toBeNull();
  });

  it('clears pax shift scratch when the report date changes', () => {
    const storage = new MemoryStorage();
    storage.setItem(PAX_SHIFT_REPORT_VIEW_KEY, '{}');
    storage.setItem(paxShiftFlightHandlingStorageKey('200'), 'b');
    storage.setItem('theme', 'light');

    clearPaxShiftSessionScratch(storage);

    expect(storage.getItem(PAX_SHIFT_REPORT_VIEW_KEY)).toBeNull();
    expect(storage.getItem(paxShiftFlightHandlingStorageKey('200'))).toBeNull();
    expect(storage.getItem('theme')).toBe('light');
  });
});

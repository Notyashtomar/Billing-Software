import { validateExcelHeaders } from './validators/header.validator';
import { validateExcelFile } from './validators/excel-file.validator';
import { validateFlightImportRow } from './validators/flight-row.validator';
import { validateBusinessRules } from './validators/business-rule.validator';
import type { FlightImportMasterSnapshot } from './validators/business-rule.validator';

describe('Flight import validation', () => {
  const masters: FlightImportMasterSnapshot = {
    airlineByName: new Map([
      ['air india', { name: 'Air India', code: 'AI' }],
    ]),
    airlineByCode: new Map([['AI', { name: 'Air India', code: 'AI' }]]),
    aircraftTypes: new Set(['a320']),
    airportCodes: new Set(['DEL', 'BOM']),
  };

  it('rejects invalid headers', () => {
    const result = validateExcelHeaders(['airline', 'flightNo']);
    expect(result.valid).toBe(false);
    expect(result.error?.missingHeaders).toContain('serialNo');
  });

  it('detects duplicate headers', () => {
    const result = validateExcelHeaders([
      'airline',
      'flightNo',
      'serialNo',
      'acType',
      'routing',
      'staTime',
      'aBody',
      'stdTime',
      'opsType',
      'skdNsnkdr',
      'airlineCode',
      'freighter',
      'date',
      'date',
      'category',
    ]);
    expect(result.valid).toBe(false);
    expect(result.error?.duplicateHeaders).toContain('date');
  });

  it('rejects empty upload', () => {
    const result = validateExcelFile(undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid time', async () => {
    const row = await validateFlightImportRow(2, {
      airline: 'Air India',
      flightNo: 'AI-101',
      serialNo: '100001',
      acType: 'A320',
      routing: 'DEL-BOM',
      staTime: '25:00',
      aBody: 'N',
      stdTime: '07:15',
      opsType: 'Turnaround',
      skdNsnkdr: 'Additional',
      airlineCode: 'AI',
      freighter: 'N',
      date: '09/06/2026',
      date2: '09/06/2026',
      category: 'International',
    });
    expect(row.valid).toBe(false);
    expect(row.errors.some((e) => e.column === 'staTime')).toBe(true);
  });

  it('rejects invalid routing', async () => {
    const row = await validateFlightImportRow(2, {
      airline: 'Air India',
      flightNo: 'AI-101',
      serialNo: '100001',
      acType: 'A320',
      routing: 'DELBOM',
      staTime: '06:30',
      aBody: 'N',
      stdTime: '07:15',
      opsType: 'Turnaround',
      skdNsnkdr: 'Additional',
      airlineCode: 'AI',
      freighter: 'N',
      date: '09/06/2026',
      date2: '09/06/2026',
      category: 'International',
    });
    expect(row.valid).toBe(false);
    expect(row.errors.some((e) => e.column === 'routing')).toBe(true);
  });

  it('rejects duplicate rows in file', async () => {
    const tracker = { flightDateKeys: new Set<string>(), serialNos: new Set<string>() };
    const dto = {
      airline: 'Air India',
      flightNo: 'AI-101',
      serialNo: '100001',
      acType: 'A320',
      routing: 'DEL-BOM',
      staTime: '06:30',
      aBody: 'N',
      stdTime: '07:15',
      opsType: 'Turnaround',
      skdNsnkdr: 'Additional',
      airlineCode: 'AI',
      freighter: 'N',
      date: '09/06/2026',
      date2: '09/06/2026',
      category: 'International',
    } as const;

    validateBusinessRules(2, dto, masters, tracker);
    const dupErrors = validateBusinessRules(3, dto, masters, tracker);
    expect(dupErrors.some((e) => e.message.includes('Duplicate flightNo'))).toBe(true);
  });

  it('rejects enum validation for category', async () => {
    const row = await validateFlightImportRow(2, {
      airline: 'Air India',
      flightNo: 'AI-101',
      serialNo: '100001',
      acType: 'A320',
      routing: 'DEL-BOM',
      staTime: '06:30',
      aBody: 'N',
      stdTime: '07:15',
      opsType: 'Turnaround',
      skdNsnkdr: 'Additional',
      airlineCode: 'AI',
      freighter: 'N',
      date: '09/06/2026',
      date2: '09/06/2026',
      category: 'Cargo',
    });
    expect(row.valid).toBe(false);
    expect(row.errors.some((e) => e.column === 'category')).toBe(true);
  });
});

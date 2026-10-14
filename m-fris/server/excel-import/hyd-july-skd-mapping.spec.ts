import {
  asSchemaDate,
  asSchemaTime,
  mapHydJulyRow,
  normalizeHydHeader,
  parseHydFlightNo,
  parseYesNo,
  rowObjectFromHeaders,
  HYD_JULY_HEADER_KEYS,
} from './hyd-july-skd-mapping';

const WORKBOOK_HEADERS = [
  'Serial Number',
  'Customer Name',
  'Customer Code',
  'Flight No',
  'Aircraft Type',
  'Aircraft Body',
  'Category of Flight',
  'Type of Handling',
  'Type of Flight',
  'Route',
  'Cargo',
  'STA Date',
  'STA Time',
  'ATA Date',
  'ATA Time',
  'STD Date',
  'STD Time',
  'ATD Date',
  'ATD Time',
  'Delay On STD',
  'Delay On STA',
  'Delay Status',
  'Arr. WCC',
  'Arr. WCS',
  'Arr. WCR',
  'Dep. WCC',
  'Dep. WCS',
  'Dep. WCR',
  'Total WCC',
  'Total WCHS',
  'Total WCHR',
  'Terminal',
  'Return To Ramp',
  'Send Status(Flight Data)',
  'Send Status(WCHC)',
  'Send Status(WCHS)',
  'Send Status(WCHR)',
  'Uld Arr.',
  'Cargo Arr.',
  'Mail Arr.',
  'Uld Plan',
  'Cargo Plan',
  'Mail Plan',
  'Uld Dep',
  'Cargo Dep',
  'Mail Dep',
  'Report1',
  'Report No 1',
  'Report2',
  'Report No 2',
  'Report3',
  'Report No 3',
  'Report4',
  'Report No 4',
  'Report5',
  'Report No 5',
  'Report6',
  'Report No 6',
  'MTOW',
  'Regn',
  'Flight DataExported Date',
  'Flight DataExported By',
  'Flight DataExportedBy ID',
  'WCHC Exported Date',
  'WCHC Exported By',
  'WCHC ExportedBy ID',
  'WCHS Exported Date',
  'WCHS Exported By',
  'WCHS ExportedBy ID',
  'WCHR Exported Date',
  'WCHR Exported By',
  'WCHR ExportedBy ID',
];

describe('hyd-july-skd-mapping', () => {
  it('maps every HYD July workbook header', () => {
    expect(WORKBOOK_HEADERS).toHaveLength(72);
    const missing = WORKBOOK_HEADERS.filter(
      (h) => !HYD_JULY_HEADER_KEYS[normalizeHydHeader(h)],
    );
    expect(missing).toEqual([]);
  });

  it('keeps STA date and time split per schema', () => {
    expect(asSchemaDate('30/06/2026')).toBe('30/06/2026');
    expect(asSchemaTime('22:35')).toBe('22:35');
    expect(asSchemaDate('01/07/2026 02:00')).toBe('01/07/2026');
    expect(asSchemaTime('01/07/2026 02:00')).toBe('02:00');
  });

  it('parses turnaround / originate / terminate flight numbers', () => {
    expect(parseHydFlightNo('VJ-1803/1804')).toEqual({
      flightNo: 'VJ-1803/1804',
      arrival: 'VJ-1803',
      departure: 'VJ-1804',
      split: true,
    });
    expect(parseHydFlightNo('QR500/501')).toEqual({
      flightNo: 'QR500/501',
      arrival: 'QR500',
      departure: 'QR501',
      split: true,
    });
    expect(parseHydFlightNo('S5 /212').arrival).toBe('');
    expect(parseHydFlightNo('S5 /212').departure).toBe('S5212');
    expect(parseHydFlightNo('S5 213/').arrival).toBe('S5 213');
    expect(parseHydFlightNo('S5 213/').departure).toBe('');
  });

  it('maps a sample Vietjet row onto schema field names', () => {
    const values: Record<string, string> = {
      'Serial Number': '29319',
      'Customer Name': 'Vietjet Air',
      'Customer Code': 'VJ',
      'Flight No': 'VJ-1803/1804',
      'Aircraft Type': 'A321',
      'Aircraft Body': 'NB',
      'Category of Flight': 'International',
      'Type of Handling': 'Scheduled',
      'Type of Flight': 'Turnaround',
      Route: 'SGN-HYD-SGN',
      Cargo: 'No',
      'STA Date': '30/06/2026',
      'STA Time': '22:35',
      'ATA Date': '30/06/2026',
      'ATA Time': '23:07',
      'STD Date': '30/06/2026',
      'STD Time': '23:35',
      'ATD Date': '01/07/2026',
      'ATD Time': '00:00',
      'Delay On STD': '00:25',
      'Delay On STA': '0:32',
      'Delay Status': 'Delay',
      'Arr. WCC': '0',
      'Arr. WCS': '0',
      'Arr. WCR': '0',
      'Dep. WCC': '0',
      'Dep. WCS': '0',
      'Dep. WCR': '4',
      'Total WCC': '0',
      'Total WCHS': '0',
      'Total WCHR': '4',
      Terminal: 'RGI',
      'Return To Ramp': ' ',
      'Send Status(Flight Data)': 'Y',
      'Send Status(WCHC)': 'N',
      'Send Status(WCHS)': 'N',
      'Send Status(WCHR)': 'Y',
      'Uld Arr.': ' ',
      'Cargo Arr.': '213',
      'Mail Arr.': ' ',
      'Uld Plan': ' ',
      'Cargo Plan': '0',
      'Mail Plan': ' ',
      'Uld Dep': ' ',
      'Cargo Dep': '0',
      'Mail Dep': ' ',
      MTOW: ' ',
      Regn: 'VNA653',
      'Flight DataExported Date': '01 Jul 2026 13:56',
      'Flight DataExported By': 'Vishwanath',
      'Flight DataExportedBy ID': 'ggi0073',
      'WCHR Exported Date': '7/1/2026 1:56:00 PM',
      'WCHR Exported By': 'Vishwanath',
      'WCHR ExportedBy ID': 'ggi0073',
    };
    const line = WORKBOOK_HEADERS.map((h) => values[h] ?? '');
    const mapped = mapHydJulyRow(WORKBOOK_HEADERS, line);
    expect('error' in mapped).toBe(false);
    if ('error' in mapped) return;
    expect(mapped.serial).toBe(29319);
    expect(mapped.headersUnmapped).toEqual([]);
    expect(mapped.headersMapped).toHaveLength(72);
    expect(mapped.main.Airline).toBe('Vietjet Air');
    expect(mapped.main.Arline_Code).toBe('VJ');
    expect(mapped.main.FlightNo).toBe('VJ-1803/1804');
    expect(mapped.main.STADate).toBe('30/06/2026');
    expect(mapped.main.STATime).toBe('22:35');
    expect(mapped.main.ATDDate).toBe('01/07/2026');
    expect(mapped.main.ATDTime).toBe('00:00');
    expect(mapped.main.freighter).toBe(false);
    expect(mapped.ramp.cgoarr).toBe('213');
    expect(mapped.ramp.cgoplan).toBe('0');
    expect(mapped.terminal.Departure_wcr).toBe('4');
    expect(mapped.staIso).toBe('2026-06-30');
    expect(mapped.workbookExtras['Send Status(Flight Data)']).toBe('Y');
    expect(mapped.workbookExtras['Total WCHR']).toBe('4');
    expect(mapped.lastSnapshotAt?.getFullYear()).toBe(2026);
    expect(mapped.lastSnapshotAt?.getMonth()).toBe(6);
  });

  it('treats Cargo Yes as freighter', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo('No')).toBe(false);
  });

  it('flags unknown headers so seeding cannot silently skip columns', () => {
    const { unmapped } = rowObjectFromHeaders(['Mystery Col'], ['x']);
    expect(unmapped).toEqual(['Mystery Col']);
  });
});

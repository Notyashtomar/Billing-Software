import {
  excelSerialToParts,
  excelUsageToHours,
  hoursToHhMm,
  parseMaaRafDisplayDateText,
  parseMaaRafWorkbook,
  resolveRafEquipment,
} from './maa-raf-excel.util';
import * as XLSX from 'xlsx';

describe('maa-raf-excel.util', () => {
  it('maps known equipment codes to RAF catalog + adhoc particulars', () => {
    expect(resolveRafEquipment('GPU-140KV')).toMatchObject({
      serviceCode: 'RAF - Equipment - GPU-140KV',
      particular: 'Ground Power Unit (GPU) 140 KV',
    });
    expect(resolveRafEquipment('UH').kind).toBe('manpower');
  });

  it('maps HYD PAX COACH to billing catalog service code', () => {
    expect(resolveRafEquipment('PAX COACH')).toMatchObject({
      code: 'PAX Coach',
      kind: 'equipment',
      serviceCode: 'RAF - Equipment - PAX Coach',
      particular: 'PAX Coach',
      uom: 'Per Trip',
    });
  });

  it('converts excel day-fraction usages to hours', () => {
    expect(excelUsageToHours(0.0416666667)).toBeCloseTo(1, 3);
    expect(hoursToHhMm(1)).toBe('01:00');
  });

  it('parses mixed date cells', () => {
    const fromSerial = excelSerialToParts(46025);
    expect(fromSerial?.ymd).toMatch(/^2026-/);
    const fromText = excelSerialToParts('15/05/2026 14:50');
    expect(fromText).toEqual({
      ymd: '2026-05-15',
      ddMmYyyy: '15/05/2026',
      hhMm: '14:50',
    });
  });

  it('parses Chennai dd/MM display text including two-digit years', () => {
    expect(parseMaaRafDisplayDateText('8/3/26')).toEqual({
      ymd: '2026-03-08',
      ddMmYyyy: '08/03/2026',
      hhMm: '00:00',
    });
    expect(parseMaaRafDisplayDateText('8/3/26 9:08')).toEqual({
      ymd: '2026-03-08',
      ddMmYyyy: '08/03/2026',
      hhMm: '09:08',
    });
    expect(parseMaaRafDisplayDateText('12/5/26')).toEqual({
      ymd: '2026-05-12',
      ddMmYyyy: '12/05/2026',
      hhMm: '00:00',
    });
  });

  it('prefers formatted dd/MM cell text over US Excel serial on numeric cells', () => {
    const aoa = [
      [
        'Serial Number',
        'Customer Name',
        'Customer Code',
        'Flight No',
        'STD Date',
        'ATD Date',
        'Equipment No',
        'Usages Time',
        'From Date',
        'To date',
        'Remarks',
        'Type Craft',
        'Category Of Flight',
      ],
      [
        382,
        'INDAMER AVIATION',
        'IND',
        'VT-SRH',
        46237,
        46237,
        'RC',
        0.0416666667,
        46237.38055555556,
        46237.42083333333,
        '',
        'GLOBAL 7500',
        'Domestic',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['E2'].z = 'm/d/yy';
    ws['E2'].w = '8/3/26';
    ws['F2'].z = 'm/d/yy';
    ws['F2'].w = '8/3/26';
    ws['I2'].z = 'm/d/yy h:mm';
    ws['I2'].w = '8/3/26 9:08';
    ws['J2'].z = 'm/d/yy h:mm';
    ws['J2'].w = '8/3/26 10:06';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const parsed = parseMaaRafWorkbook(wb, {
      fromYmd: '2026-03-01',
      toYmd: '2026-07-31',
    });
    expect(parsed.skippedOutsideWindow).toBe(0);
    expect(parsed.flights).toHaveLength(1);
    expect(parsed.flights[0].operationYmd).toBe('2026-03-08');
    expect(parsed.flights[0].services[0].equipmentCode).toBe('RC');
  });

  it('groups workbook rows by serial and respects date window', () => {
    const aoa = [
      [
        'Serial Number',
        'Customer Name',
        'Customer Code',
        'Flight No',
        'STD Date',
        'ATD Date',
        'Equipment No',
        'Usages Time',
        'From Date',
        'To date',
        'Remarks',
        'Type Craft',
        'Category Of Flight',
      ],
      [
        379,
        'AFCOM HOLDINGS LTD',
        'COM',
        'VH-8TG',
        '15/03/2026',
        '15/03/2026',
        'GPU-140KV',
        0.0416666667,
        '15/03/2026 10:00',
        '15/03/2026 11:00',
        '',
        'B737 - 800F',
        'Domestic',
      ],
      [
        379,
        'AFCOM HOLDINGS LTD',
        'COM',
        'VH-8TG',
        '15/03/2026',
        '15/03/2026',
        'PBNB',
        1,
        '15/03/2026 11:00',
        '15/03/2026 11:30',
        '',
        'B737 - 800F',
        'Domestic',
      ],
      [
        400,
        'FLY HIGH',
        'FLY',
        'VT-PLV',
        '15/08/2026',
        '15/08/2026',
        'EBT',
        0.5,
        '15/08/2026 10:00',
        '15/08/2026 22:00',
        '',
        'G-150',
        'Domestic',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const parsed = parseMaaRafWorkbook(wb, {
      fromYmd: '2026-03-01',
      toYmd: '2026-07-31',
    });
    expect(parsed.flights).toHaveLength(1);
    expect(parsed.flights[0].services).toHaveLength(2);
    expect(parsed.skippedOutsideWindow).toBe(1);
  });
});

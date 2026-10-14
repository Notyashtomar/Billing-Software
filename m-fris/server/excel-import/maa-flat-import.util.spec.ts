import {
  airlineCodeFromCompactFlightNo,
  applyDelayFieldsFromFlatRow,
  enrichMainDtoFromFlatRow,
  normalizeFlatImportRow,
  parseFlatImportSerial,
  parseFlatYesNo,
  remapFlatPickedFields,
  resolveFlatRowAirline,
  resolveFlatRowFlightNo,
  rowStaDateInRange,
} from './maa-flat-import.util';
import type { CreateMainDetailsDto } from 'src/main-details/dto/create-main-details.dto';

describe('maa-flat-import.util (aug schema-key workbook)', () => {
  it('normalizes Aug Customers aliases onto schema keys', () => {
    const raw = normalizeFlatImportRow({
      AircraftBody: 'WB',
      Delay: 'Delay',
      ReasonofDelay: '23MIN-RAD',
      fltcancelled: 'No',
      'Arrival Flt No': 'EK546',
      'Departure Flt No': 'EK547',
      ArrBelt: '8',
      transitPax: '12',
      Cgo: 'No',
      Return_To_Ramp: '',
      ETDdate: '02/08/2026',
      loadgivenat: '10:00',
      CALRem: 'ARR WHEELCHAIR',
    } as Record<string, string>);

    expect(raw.aircraftBody).toBe('WB');
    expect(raw.departureStatus).toBe('Delay');
    expect(raw.reasonOfDelay).toBe('23MIN-RAD');
    expect(raw.flightCancelled).toBe('No');
    expect(raw.ArrivalFltNo).toBe('EK546');
    expect(raw.DepartureFltNo).toBe('EK547');
    expect(raw.beltNo).toBe('8');
    expect(raw.transit).toBe('12');
    expect(raw.etdDate).toBe('02/08/2026');
    expect(raw.loadingDiagramGivenAt).toBe('10:00');
    expect(raw.ghRemarks).toBe('ARR WHEELCHAIR');
  });

  it('parses SerialNo without treating large numbers as Excel dates', () => {
    expect(parseFlatImportSerial({ SerialNo: 20633 })).toBe(20633);
    expect(parseFlatImportSerial({ SerialNo: '21,266' })).toBe(21266);
  });

  it('resolves Airline / FlightNo from schema-key headers', () => {
    const raw = normalizeFlatImportRow({
      Airline: 'Emirates',
      FlightNo: 'EK546/547',
      Arline_Code: 'EK',
    } as Record<string, string>);
    expect(resolveFlatRowAirline(raw)).toBe('Emirates');
    expect(resolveFlatRowFlightNo(raw)).toBe('EK546/547');
  });

  it('removes spaces inside flight numbers', () => {
    expect(
      resolveFlatRowFlightNo({ FlightNo: 'SG 9112' } as Record<string, string>),
    ).toBe('SG9112');
    expect(
      resolveFlatRowFlightNo({ FlightNo: 'O3 239/160' } as Record<string, string>),
    ).toBe('O3239/160');
    expect(
      resolveFlatRowFlightNo({ FlightNo: 'CANC -6E 04/03' } as Record<string, string>),
    ).toBe('CANC-6E04/03');
  });

  it('enriches main DTO with FlightNo, code, body, and yes/no flags', () => {
    const dto = {
      Airline: 'Emirates',
      Arline_Code: 'EK',
    } as CreateMainDetailsDto;
    enrichMainDtoFromFlatRow(
      dto,
      normalizeFlatImportRow({
        Airline: 'Emirates',
        FlightNo: 'EK546/547',
        Arline_Code: 'EK',
        AircraftBody: 'WB',
        Cgo: 'No',
        fltcancelled: 'No',
        IsSplit: 'No',
        TypeofHandling: 'Scheduled',
        MTOW: '351',
      } as Record<string, string>),
    );
    expect(dto.FlightNo).toBe('EK546/547');
    expect(dto.aircraftBody).toBe('WB');
    expect(dto.freighter).toBe(false);
    expect(dto.flightCancelled).toBe(false);
    expect(dto.ifOperationSplit).toBe(false);
    expect(dto.TypeofHandling).toBe('Scheduled');
    expect(dto.MTOW).toBe('351');
  });

  it('maps ramp yes/no cells onto boolean schema fields', () => {
    const remapped = remapFlatPickedFields(
      {
        XRay: 'Yes',
        'One-Sided Belt': 'No',
        'Custom Checked': 'No',
        BayPlanned: '28',
      },
      'ramp',
    );
    expect(remapped.xRay).toBe(true);
    expect(remapped.oneSidedBelt).toBe(false);
    expect(remapped.customChecked).toBe(false);
    expect(remapped.BayPlanned).toBe('28');
  });

  it('maps Cochin workbook headers onto schema fields', () => {
    const raw = normalizeFlatImportRow({
      STATIME: '10:00',
      FlightCancelled: 'Yes',
      Freighter: 'No',
      FlightNo: 'CANC -IX 1797/1798',
      Airline: 'Air India Express Limited',
      delay1: '01:22',
      delaycode2: '96 Operations control',
      delay2: '00:30',
      delaycode3: 'Aircraft from previous sector delayed',
      delay3: '01:25',
      delaycode31: 'Aircraft from previous sector delayed',
    } as Record<string, string>);

    expect(raw.STATime).toBe('10:00');
    expect(raw.flightCancelled).toBe('Yes');
    expect(raw.freighter).toBe('No');
    expect(resolveFlatRowFlightNo(raw)).toBe('CANC-IX1797/1798');
    expect(airlineCodeFromCompactFlightNo(resolveFlatRowFlightNo(raw))).toBe('IX');

    const dto = { Airline: 'Air India Express Limited', Arline_Code: 'AI' } as CreateMainDetailsDto;
    enrichMainDtoFromFlatRow(dto, raw);
    expect(dto.flightCancelled).toBe(true);
    expect(dto.freighter).toBe(false);
    expect(dto.Arline_Code).toBe('IX');
    expect(dto.ArrivalFltNo).toBe('IX1797');
    expect(dto.DepartureFltNo).toBe('IX1798');
    expect(dto.ifOperationSplit).toBe(true);
    expect(dto.TypeofHandling).toBe('Scheduled');
    expect(dto.STATime).toBeUndefined();

    applyDelayFieldsFromFlatRow(dto, raw);
    expect(dto.departureDelays).toEqual([
      { Delay: '01:22', ReasonofDelay: '', gh: false, oth: false },
      { Delay: '00:30', ReasonofDelay: '96 Operations control', gh: false, oth: false },
      {
        Delay: '01:25',
        ReasonofDelay: 'Aircraft from previous sector delayed',
        gh: false,
        oth: false,
      },
    ]);
  });

  it('keeps Jul 31 overnight STA inside Aug refill window', () => {
    expect(
      rowStaDateInRange(
        { STADate: '31/07/2026' },
        '2026-07-31',
        '2026-08-31',
      ),
    ).toBe(true);
    expect(
      rowStaDateInRange({ STADate: '01/08/2026' }, '2026-07-31', '2026-08-31'),
    ).toBe(true);
    expect(
      rowStaDateInRange({ STADate: '30/06/2026' }, '2026-07-31', '2026-08-31'),
    ).toBe(false);
  });

  it('splits combined date+time into separate schema fields', () => {
    const raw = normalizeFlatImportRow({
      STADate: '09/08/2026 17:45',
      STATime: '',
      IPosDate: '09/08/2026 18:01',
      IPosTime: '',
      RESKD_STA: '10/08/2026 06:30',
      RESKD_STADate: '',
    } as Record<string, string>);
    expect(raw.STADate).toBe('09/08/2026');
    expect(raw.STATime).toBe('17:45');
    expect(raw.IPosDate).toBe('09/08/2026');
    expect(raw.IPosTime).toBe('18:01');
    expect(raw.RESKD_STADate).toBe('10/08/2026');
    expect(raw.RESKD_STA).toBe('06:30');
  });

  it('keeps combined STADate inside Aug window after split', () => {
    expect(
      rowStaDateInRange(
        { STADate: '09/08/2026 17:45' },
        '2026-07-31',
        '2026-08-31',
      ),
    ).toBe(true);
  });

  it('parses yes/no cells', () => {
    expect(parseFlatYesNo('Yes')).toBe(true);
    expect(parseFlatYesNo('No')).toBe(false);
    expect(parseFlatYesNo('Y')).toBe(true);
    expect(parseFlatYesNo('True')).toBe(true);
  });
});

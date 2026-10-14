import {
  GHA_CODE_COLS,
  GHA_TIME_BUCKET_COLS,
  GT_BUCKET_COLS,
  NON_GHA_TIME_BUCKET_COLS,
  dataRowFormulas,
} from './station-wise-formulas.util';

export type StationWiseColumnKind = 'input' | 'formula';

export type StationWiseSheetColumn = {
  letter: string;
  key: string;
  label: string;
  kind: StationWiseColumnKind;
  group: string;
  /** Excel formula template for data row 4 (formula cols only). */
  formulaSample?: string;
};

export const INPUT_COLUMNS: StationWiseSheetColumn[] = [
  { letter: 'A', key: 'serialNo', label: 'SerialNo', kind: 'input', group: 'Flight' },
  { letter: 'B', key: 'airline', label: 'Airline', kind: 'input', group: 'Flight' },
  { letter: 'C', key: 'flightNo', label: 'FlightNo', kind: 'input', group: 'Flight' },
  { letter: 'D', key: 'typeCraft', label: 'TypeCraft', kind: 'input', group: 'Flight' },
  { letter: 'E', key: 'staTime', label: 'STATime', kind: 'input', group: 'Schedule' },
  { letter: 'F', key: 'staDate', label: 'STADate', kind: 'input', group: 'Schedule' },
  { letter: 'G', key: 'stdTime', label: 'STDTime', kind: 'input', group: 'Schedule' },
  { letter: 'H', key: 'stdDate', label: 'STDDate', kind: 'input', group: 'Schedule' },
  { letter: 'I', key: 'ataTime', label: 'ATATime', kind: 'input', group: 'Actual' },
  { letter: 'J', key: 'ataDate', label: 'ATADate', kind: 'input', group: 'Actual' },
  { letter: 'K', key: 'atdTime', label: 'ATDTime', kind: 'input', group: 'Actual' },
  { letter: 'L', key: 'atdDate', label: 'ATDDate', kind: 'input', group: 'Actual' },
  { letter: 'M', key: 'delay', label: 'Delay', kind: 'input', group: 'Delay' },
  { letter: 'N', key: 'actualDelay', label: 'ActualDelay', kind: 'input', group: 'Delay' },
  { letter: 'O', key: 'delay1', label: 'delay1', kind: 'input', group: 'Delay' },
  { letter: 'P', key: 'reasonOfDelay', label: 'ReasonofDelay', kind: 'input', group: 'Delay' },
  { letter: 'Q', key: 'delay2', label: 'delay2', kind: 'input', group: 'Delay' },
  { letter: 'R', key: 'delaycode2', label: 'delaycode2', kind: 'input', group: 'Delay' },
  { letter: 'S', key: 'delay3', label: 'delay3', kind: 'input', group: 'Delay' },
  { letter: 'T', key: 'delaycode3', label: 'delaycode3', kind: 'input', group: 'Delay' },
];

const CORE_FORMULA_LABELS: Record<string, { label: string; group: string }> = {
  U: { label: 'Diff Arr Date', group: 'Timing' },
  V: { label: 'Diff Dep Date', group: 'Timing' },
  W: { label: 'Late ATA', group: 'Timing' },
  X: { label: 'Late ATD', group: 'Timing' },
  Y: { label: 'Delay Status', group: 'Timing' },
  Z: { label: 'Delay Category', group: 'Timing' },
  AA: { label: 'Code 1', group: 'Delay codes' },
  AB: { label: 'Code 1 Time', group: 'Delay codes' },
  AC: { label: 'Code 2', group: 'Delay codes' },
  AD: { label: 'Code 2 Time', group: 'Delay codes' },
  AE: { label: 'Code 3', group: 'Delay codes' },
  AF: { label: 'Code 3 Time', group: 'Delay codes' },
  BB: { label: 'Total', group: 'GHA codes' },
  BC: { label: 'GHA Delays', group: 'GHA codes' },
  BD: { label: 'XXLD Flt', group: 'XXLD / GT' },
  BE: { label: '# of XXLD Flt', group: 'XXLD / GT' },
  BF: { label: 'STD GT', group: 'XXLD / GT' },
  BG: { label: 'ACTUAL GT', group: 'XXLD / GT' },
  BH: { label: 'GT SAVED', group: 'XXLD / GT' },
  CB: { label: 'Total delay', group: 'OTP flags' },
  CC: { label: 'Flights within STA & STD', group: 'OTP flags' },
  CD: { label: 'Actual GT=< STD GT', group: 'OTP flags' },
  CE: { label: 'AGT > SGT', group: 'OTP flags' },
  DA: { label: 'Non GHA Delay', group: 'Non-GHA' },
  DB: { label: 'Non GHA Delay Time', group: 'Non-GHA' },
  DW: { label: 'Flights Arrived Later Than STA', group: 'Final report' },
  DX: { label: 'And Departed On Or Before STD', group: 'Final report' },
  DY: { label: 'Departed Post STD but AGT <= SGT', group: 'Final report' },
  DZ: { label: 'AGT > SGT (Reasons Not Attributable To GHA)', group: 'Final report' },
  EA: { label: 'AGT > SGT (Reasons Not Attributable to GHA)', group: 'Final report' },
  EB: { label: 'Flights Arrived on or Before STA', group: 'Final report' },
  EC: { label: 'On Time Flights', group: 'Final report' },
  ED: { label: 'Before STA Flights', group: 'Final report' },
  EE: { label: 'Departed Before STD & AGT < SGT', group: 'Final report' },
  EF: { label: 'Departed Before STD & AGT = SGT', group: 'Final report' },
  EG: { label: 'Exceeding SGT But Before STD', group: 'Final report' },
  EH: { label: 'Exceeding SGT and Also After STD', group: 'Final report' },
  EI: { label: 'AGT > SGT & Departed post STD (Non-GHA)', group: 'Final report' },
  EJ: { label: 'AGT > SGT & Departed post STD (GHA)', group: 'Final report' },
};

function formulaCol(
  letter: string,
  label: string,
  group: string,
  formulas: Record<string, string>,
): StationWiseSheetColumn {
  return {
    letter,
    key: letter,
    label,
    kind: 'formula',
    group,
    formulaSample: formulas[letter] ? `=${formulas[letter]}` : undefined,
  };
}

/** Full month-sheet column map: A–T inputs + every live formula column. */
export function listStationWiseSheetColumns(): StationWiseSheetColumn[] {
  const formulas = dataRowFormulas(4);
  const out: StationWiseSheetColumn[] = [...INPUT_COLUMNS];

  for (const [letter, meta] of Object.entries(CORE_FORMULA_LABELS)) {
    out.push(formulaCol(letter, meta.label, meta.group, formulas));
  }

  for (const { col, code } of GHA_CODE_COLS) {
    out.push(formulaCol(col, `GHA ${code}`, 'GHA codes', formulas));
  }

  GT_BUCKET_COLS.forEach((col, i) => {
    out.push(
      formulaCol(
        col,
        col === 'CA' ? 'GT > 03:00' : `GT bucket ${i + 1}`,
        'GT buckets',
        formulas,
      ),
    );
  });

  GHA_TIME_BUCKET_COLS.forEach((col, i) => {
    out.push(
      formulaCol(
        col,
        col === 'CY' ? 'GHA delay > 03:00' : `GHA delay bucket ${i + 1}`,
        'GHA delay buckets',
        formulas,
      ),
    );
  });

  NON_GHA_TIME_BUCKET_COLS.forEach((col, i) => {
    out.push(
      formulaCol(
        col,
        col === 'DU' ? 'Non-GHA delay > 03:00' : `Non-GHA delay bucket ${i + 1}`,
        'Non-GHA delay buckets',
        formulas,
      ),
    );
  });

  return out;
}

export function listFormulaSheetColumns(): StationWiseSheetColumn[] {
  return listStationWiseSheetColumns().filter((c) => c.kind === 'formula');
}

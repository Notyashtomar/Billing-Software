/** GHA delay-code columns — same whitelist as the MAA bird-report workbook. */
export const GHA_CODE_COLS: Array<{ col: string; code: number }> = [
  { col: 'AG', code: 11 },
  { col: 'AH', code: 12 },
  { col: 'AI', code: 13 },
  { col: 'AJ', code: 15 },
  { col: 'AK', code: 17 },
  { col: 'AL', code: 18 },
  { col: 'AM', code: 19 },
  { col: 'AN', code: 21 },
  { col: 'AO', code: 22 },
  { col: 'AP', code: 23 },
  { col: 'AQ', code: 28 },
  { col: 'AR', code: 29 },
  { col: 'AS', code: 31 },
  { col: 'AT', code: 32 },
  { col: 'AU', code: 33 },
  { col: 'AV', code: 34 },
  { col: 'AW', code: 35 },
  { col: 'AX', code: 37 },
  { col: 'AY', code: 38 },
  { col: 'AZ', code: 39 },
  { col: 'BA', code: 52 },
];

/** 10-minute GT-saved buckets BI–BZ plus overflow CA. */
export const GT_BUCKET_COLS = [
  'BI',
  'BJ',
  'BK',
  'BL',
  'BM',
  'BN',
  'BO',
  'BP',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BU',
  'BV',
  'BW',
  'BX',
  'BY',
  'BZ',
  'CA',
] as const;

export const GHA_TIME_BUCKET_COLS = [
  'CG',
  'CH',
  'CI',
  'CJ',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CP',
  'CQ',
  'CR',
  'CS',
  'CT',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
] as const;

export const NON_GHA_TIME_BUCKET_COLS = [
  'DC',
  'DD',
  'DE',
  'DF',
  'DG',
  'DH',
  'DI',
  'DJ',
  'DK',
  'DL',
  'DM',
  'DN',
  'DO',
  'DP',
  'DQ',
  'DR',
  'DS',
  'DT',
  'DU',
] as const;

const TEN_MIN = 10 / (24 * 60) + 1 / (24 * 60 * 60);

export function bucketThresholdExcel(indexFrom10: number): number {
  if (indexFrom10 >= 18) return 3 / 24;
  return (indexFrom10 + 1) * TEN_MIN;
}

/**
 * Live Excel formulas for one flight row. `{r}` is the 1-based row.
 * Matches MAA JAN26 row 4 (`$W$2` used for midnight — source `$WS$2` is a typo).
 */
export function dataRowFormulas(r: number): Record<string, string> {
  const out: Record<string, string> = {
    U: `IF(F${r}=J${r},0,1)`,
    V: `IF(H${r}=L${r},0,1)`,
    W: `IF(U${r}=1,MAX(0,$W$2-E${r}+I${r}),IF(I${r}>E${r},I${r}-E${r},"Before STA"))`,
    X: `IF(K${r}>G${r},IF(V${r}=1,$W$2-G${r}+K${r},K${r}-G${r}),"Before STD")`,
    Y: `IF(X${r}="Before STD","Before STD",IF(W${r}="Before STA","LDAT",IF(W${r}>X${r},W${r}-X${r},"LDAT")))`,
    Z: `IF(I${r}="","CANC",IF(Y${r}="Before STD",1,IF(Y${r}="LDAT",2,"LAST")))`,
    AA: `IFERROR((MID(P${r},1,2))*1,0)`,
    AB: `O${r}`,
    AC: `IFERROR((MID(R${r},1,2))*1,0)`,
    AD: `Q${r}`,
    AE: `IFERROR((MID(T${r},1,2))*1,0)`,
    AF: `S${r}`,
    BB: `SUBTOTAL(9,AG${r}:BA${r})`,
    BC: `IF(BB${r}>0,1,0)`,
    BD: `MID(C${r},1,4)`,
    BE: `IF(BD${r}="CANC",1,0)`,
    BF: `IF(BD${r}="CANC",0,IF(H${r}=F${r},G${r}-E${r},$BF$2+G${r}-E${r}))`,
    BG: `IF(BD${r}="CANC",0,IF(J${r}=L${r},K${r}-I${r},$BG$2+K${r}-I${r}))`,
    BH: `IF(BF${r}>BG${r},BF${r}-BG${r},IF(BF${r}=BG${r},0,"GT ADDED"))`,
    CB: `IF(N${r}=0,0,1)`,
    CC: `IF(I${r}<=E${r},IF(K${r}<=G${r},1,0),0)-BE${r}`,
    CD: `IF(BG${r}<=BF${r},1,0)-BE${r}-CC${r}`,
    CE: `IF(BG${r}>BF${r},1,0)`,
    DA: `CB${r}-BC${r}`,
    DB: `IF(DA${r}=1,N${r}-BB${r},0)`,
    DW: `IF(AND(J${r}=F${r},I${r}>E${r}),1,0)`,
    DX: `IF(AND(DW${r}=1,H${r}=L${r},K${r}<=G${r}),1,0)`,
    DY: `IF(AND(DW${r}=1,BG${r}<=BF${r}),1,0)-DX${r}`,
    DZ: `IF(AND(DW${r}=1,BG${r}>BF${r}),DA${r},0)`,
    EA: `DW${r}-SUM(DX${r}:DZ${r})`,
    EB: `IF(OR(F${r}>J${r},I${r}<E${r},I${r}=E${r}),1,0)-BE${r}`,
    EC: `IF(AND(E${r}=I${r},F${r}=J${r}),1,0)`,
    ED: `EB${r}-EC${r}`,
    EE: `IF(AND(ED${r}=1,BG${r}<BF${r}),1,0)`,
    EF: `IF(AND(ED${r}=1,BG${r}=BF${r}),1,0)`,
    EG: `IF(AND(ED${r}=1,BG${r}>BF${r},K${r}<=G${r}),1,0)`,
    EH: `IF(AND(ED${r}=1,BG${r}>BF${r},K${r}>G${r}),1,0)`,
    EI: `IF(EH${r}=1,DA${r},0)`,
    EJ: `EH${r}-EI${r}`,
  };

  for (const { col } of GHA_CODE_COLS) {
    out[col] =
      `IF($AA${r}=$${col}$3,$AB${r},0)+IF($AC${r}=$${col}$3,$AD${r},0)+IF($AE${r}=$${col}$3,$AF${r},0)`;
  }

  GT_BUCKET_COLS.forEach((col, i) => {
    if (i === 0) {
      out[col] = `IF($BH${r}<${col}$3,1,0)-BE${r}`;
      return;
    }
    if (col === 'CA') {
      out[col] = `IF(BH${r}="GT ADDED",0,IF($BH${r}>CA$3,1,0))`;
      return;
    }
    const prev = GT_BUCKET_COLS[i - 1];
    out[col] = `IF($BH${r}<${col}$3,1,0)-SUM($BI${r}:${prev}${r})-$BE${r}`;
  });

  GHA_TIME_BUCKET_COLS.forEach((col, i) => {
    if (i === 0) {
      out[col] = `IF($BB${r}=0,0,IF($BB${r}<${col}$3,1,0))`;
      return;
    }
    if (col === 'CY') {
      out[col] = `IF($BB${r}>CY$3,1,0)`;
      return;
    }
    const prev = GHA_TIME_BUCKET_COLS[i - 1];
    out[col] = `IF($BB${r}=0,0,IF($BB${r}<${col}$3,1,0))-SUM($CG${r}:${prev}${r})`;
  });

  NON_GHA_TIME_BUCKET_COLS.forEach((col, i) => {
    if (i === 0) {
      out[col] = `IF($DA${r}=0,0,IF($DB${r}<${col}$3,1,0))`;
      return;
    }
    if (col === 'DU') {
      out[col] = `IF($DB${r}>DU$3,1,0)`;
      return;
    }
    const prev = NON_GHA_TIME_BUCKET_COLS[i - 1];
    out[col] = `IF($DA${r}=0,0,IF($DB${r}<${col}$3,1,0)-SUM($DC${r}:${prev}${r}))`;
  });

  return out;
}

export const ROW2_TOTAL_FORMULAS: Record<string, string> = {
  BC: 'SUM(BC4:BC1048576)',
  BD: 'COUNTIF(BD4:BD1048576,"*CANC*")',
  BI: 'SUM(BI4:BI1048576)',
  BJ: 'SUM(BJ4:BJ1048576)',
  BK: 'SUM(BK4:BK1048576)',
  BL: 'SUM(BL4:BL1048576)',
  BM: 'SUM(BM4:BM1048576)',
  BN: 'SUM(BN4:BN1048576)',
  BO: 'SUM(BO4:BO1048576)',
  BP: 'SUM(BP4:BP1048576)',
  BQ: 'SUM(BQ4:BQ1048576)',
  BR: 'SUM(BR4:BR1048576)',
  BS: 'SUM(BS4:BS1048576)',
  BT: 'SUM(BT4:BT1048576)',
  BU: 'SUM(BU4:BU1048576)',
  BV: 'SUM(BV4:BV1048576)',
  BW: 'SUM(BW4:BW1048576)',
  BX: 'SUM(BX4:BX1048576)',
  BY: 'SUM(BY4:BY1048576)',
  BZ: 'SUM(BZ4:BZ1048576)',
  CA: 'SUM(CA4:CA1048576)',
  CB: 'SUM(CB4:CB1048576)',
  CC: 'SUM(CC4:CC1048576)',
  CD: 'SUM(CD4:CD1048576)',
  CE: 'SUM(CE4:CE1048576)',
  CG: 'SUM(CG4:CG1048576)',
  CH: 'SUM(CH4:CH1048576)',
  CI: 'SUM(CI4:CI1048576)',
  CJ: 'SUM(CJ4:CJ1048576)',
  CK: 'SUM(CK4:CK1048576)',
  CL: 'SUM(CL4:CL1048576)',
  CM: 'SUM(CM4:CM1048576)',
  CN: 'SUM(CN4:CN1048576)',
  CO: 'SUM(CO4:CO1048576)',
  CP: 'SUM(CP4:CP1048576)',
  CQ: 'SUM(CQ4:CQ1048576)',
  CR: 'SUM(CR4:CR1048576)',
  CS: 'SUM(CS4:CS1048576)',
  CT: 'SUM(CT4:CT1048576)',
  CU: 'SUM(CU4:CU1048576)',
  CV: 'SUM(CV4:CV1048576)',
  CW: 'SUM(CW4:CW1048576)',
  CX: 'SUM(CX4:CX1048576)',
  CY: 'SUM(CY4:CY1048576)',
  DA: 'SUM(DA4:DA1048576)',
  DC: 'SUM(DC4:DC1048576)',
  DD: 'SUM(DD4:DD1048576)',
  DE: 'SUM(DE4:DE1048576)',
  DF: 'SUM(DF4:DF1048576)',
  DG: 'SUM(DG4:DG1048576)',
  DH: 'SUM(DH4:DH1048576)',
  DI: 'SUM(DI4:DI1048576)',
  DJ: 'SUM(DJ4:DJ1048576)',
  DK: 'SUM(DK4:DK1048576)',
  DL: 'SUM(DL4:DL1048576)',
  DM: 'SUM(DM4:DM1048576)',
  DN: 'SUM(DN4:DN1048576)',
  DO: 'SUM(DO4:DO1048576)',
  DP: 'SUM(DP4:DP1048576)',
  DQ: 'SUM(DQ4:DQ1048576)',
  DR: 'SUM(DR4:DR1048576)',
  DS: 'SUM(DS4:DS1048576)',
  DT: 'SUM(DT4:DT1048576)',
  DU: 'SUM(DU4:DU1048576)',
  DW: 'SUM(DW4:DW1048576)',
  DX: 'SUM(DX4:DX1048576)',
  DY: 'SUM(DY4:DY1048576)',
  DZ: 'SUM(DZ4:DZ1048576)',
  EA: 'SUM(EA4:EA1048576)',
  EB: 'SUM(EB4:EB1048576)',
  EC: 'SUM(EC4:EC1048576)',
  ED: 'SUM(ED4:ED1048576)',
  EE: 'SUM(EE4:EE1048576)',
  EF: 'SUM(EF4:EF1048576)',
  EG: 'SUM(EG4:EG1048576)',
  EH: 'SUM(EH4:EH1048576)',
  EI: 'SUM(EI4:EI1048576)',
  EJ: 'SUM(EJ4:EJ1048576)',
};

export const COMBINED_FORMULAS: Record<string, string> = {
  EM: 'BD2',
  EN: 'DW2',
  EO: 'DX2',
  EP: 'DY2',
  EQ: 'DZ2',
  ER: 'EA2',
  ES: 'EB2',
  ET: 'EC2',
  EU: 'ED2',
  EV: 'EE2',
  EW: 'EF2',
  EX: 'EG2',
  EY: 'EI2',
  EZ: 'EJ2',
  FA: 'EM5+EN5+ES5',
};

const AIRLINE_METRIC_COLS: Array<{ col: string; source: string }> = [
  { col: 'EM', source: '$BE$4:$BE$1048576' },
  { col: 'EN', source: 'DW$4:DW$1048576' },
  { col: 'EO', source: 'DX$4:DX$1048576' },
  { col: 'EP', source: 'DY$4:DY$1048576' },
  { col: 'EQ', source: 'DZ$4:DZ$1048576' },
  { col: 'ER', source: 'EA$4:EA$1048576' },
  { col: 'ES', source: 'EB$4:EB$1048576' },
  { col: 'ET', source: 'EC$4:EC$1048576' },
  { col: 'EU', source: 'ED$4:ED$1048576' },
  { col: 'EV', source: 'EE$4:EE$1048576' },
  { col: 'EW', source: 'EF$4:EF$1048576' },
  { col: 'EX', source: 'EG$4:EG$1048576' },
  { col: 'EY', source: 'EI$4:EI$1048576' },
  { col: 'EZ', source: 'EJ$4:EJ$1048576' },
];

export function airlineRowFormulas(r: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { col, source } of AIRLINE_METRIC_COLS) {
    out[col] = `SUMIF($B$4:$B$1048576,$EL${r},${source})`;
  }
  out.FA = `EM${r}+EN${r}+ES${r}`;
  return out;
}

export const PERFORMANCE_LABELS = [
  '1. Flight Operated ON TIME',
  '2. Cancelled Flight',
  '3. Flight Operated Off - Sked :',
  'a. Ground Time Saved',
  'b. Departed on or before STD',
  'c. AGT > SGT (Reasons not attributable to GHA)',
  'Improvement for GHA',
  'Total Flights',
] as const;

export function performanceFormulas(): Array<{
  row: number;
  label: string;
  flt: string;
  pct: string;
}> {
  return [
    { row: 6, label: PERFORMANCE_LABELS[0], flt: 'ET5', pct: 'FG6/$FG$13' },
    { row: 7, label: PERFORMANCE_LABELS[1], flt: 'EM5', pct: 'FG7/$FG$13' },
    {
      row: 8,
      label: PERFORMANCE_LABELS[2],
      flt: 'SUM(FG9:FG12)',
      pct: 'FG8/$FG$13',
    },
    {
      row: 9,
      label: PERFORMANCE_LABELS[3],
      flt: 'EO5+EP5+EV5',
      pct: 'FG9/$FG$13',
    },
    {
      row: 10,
      label: PERFORMANCE_LABELS[4],
      flt: 'EW5+EX5',
      pct: 'FG10/$FG$13',
    },
    {
      row: 11,
      label: PERFORMANCE_LABELS[5],
      flt: 'EQ5+EY5',
      pct: 'FG11/$FG$13',
    },
    {
      row: 12,
      label: PERFORMANCE_LABELS[6],
      flt: 'ER5+EZ5',
      pct: 'FG12/$FG$13',
    },
    {
      row: 13,
      label: PERFORMANCE_LABELS[7],
      flt: 'FG6+FG7+FG8',
      pct: 'SUM(FH6:FH8)',
    },
  ];
}

export function previewSumFormula(
  sheetNames: string[],
  cell: string,
): string {
  if (sheetNames.length === 0) return '0';
  return sheetNames.map((name) => `'${name}'!${cell}`).join('+');
}

export function previewAirlineSumif(
  sheetNames: string[],
  metricCol: string,
  nameRow: number,
): string {
  if (sheetNames.length === 0) return '0';
  return sheetNames
    .map(
      (name) =>
        `SUMIF('${name}'!$EL$6:$EL$500,$A${nameRow},'${name}'!${metricCol}$6:${metricCol}$500)`,
    )
    .join('+');
}

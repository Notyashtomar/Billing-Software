export function parseStationCodeFromLabel(stationLabel: string): string {
  const head = stationLabel.split(/\s*[—–-]\s*/)[0]?.trim() ?? '';
  return head.toUpperCase();
}

export function stationPrefixThreeLetters(stationCode: string): string {
  const letters = stationCode.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) + 'XXX').slice(0, 3);
}

function employeeIdInitial(firstName: string): string {
  const t = firstName.trim();
  if (!t) return 'X';
  const ch = t[0]!.toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : 'X';
}

export async function proposeEmployeeId(
  stationLabel: string,
  firstName: string,
  isTaken: (id: string) => Promise<boolean>,
): Promise<string> {
  const code = parseStationCodeFromLabel(stationLabel);
  const prefix4 = `${stationPrefixThreeLetters(code)}${employeeIdInitial(firstName)}`;

  for (let n = 0; n < 10000; n++) {
    const id = `${prefix4}${n.toString().padStart(4, '0')}`;
    if (!(await isTaken(id))) return id;
  }

  for (let k = 0; k < 500; k++) {
    const id = `${prefix4}${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;
    if (!(await isTaken(id))) return id;
  }

  return `${prefix4}9999`;
}

export function buildCompanyEmail(
  firstName: string,
  lastName: string,
  company: string,
  stationLabel: string,
): string | null {
  const rules: Record<
    string,
    { kind: 'fixed'; host: string } | { kind: 'bas_station' }
  > = {
    'Bird Flight Services- BFS': { kind: 'fixed', host: 'bird.in' },
    'GlobeGround india pvt. ltd.': { kind: 'fixed', host: 'ggi.in' },
    'GSEC Bird airport Services pvt. ltd': { kind: 'fixed', host: 'gsec.in' },
    'Bird airport Services pvt. ltd': { kind: 'bas_station' },
  };

  const rule = rules[company];
  if (!rule) return null;

  const sanitize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const localFirst = sanitize(firstName);
  const localLast = sanitize(lastName);
  if (!localFirst || !localLast) return null;

  const local = `${localFirst}.${localLast}`;
  if (rule.kind === 'fixed') {
    return `${local}@${rule.host}`;
  }

  const stationCode = parseStationCodeFromLabel(stationLabel).toLowerCase();
  return `${local}@bas${stationCode}.in`;
}

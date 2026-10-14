export const ADDITIONAL_FLIGHTS_CSV_TEMPLATE =
  'Airlines,Flight No,AC Type,A Body,Airline Code,Routing,STA Time,STD Time,STA Date,STD Date,Ops Type,Skd/Non Skd,Freighter,Category Of Flight\n' +
  'Ita Airways,AZ-123,A320,NB,AZ,DEL-BOM,06:30,07:15,09/06/2026,09/06/2026,Turnaround,Additional,No,International\n';

export type ParsedAdditionalFlightCsvRow = {
  rowNumber: number;
  payload: Record<string, unknown>;
};

export type AdditionalFlightsCsvParseResult = {
  rows: ParsedAdditionalFlightCsvRow[];
  skipped: { rowNumber: number; reason: string }[];
};

const GATEWAY_SCHEDULE_HEADERS = [
  'valid from',
  'valid to',
  'mon',
  'tue',
  'wed',
  'operation split',
  'type of handling',
  'next day',
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function pickField(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function normalizeDate(value: string): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ddMmYyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (ddMmYyyy) return raw;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return null;
}

function compareDisplayDates(a: string, b: string): number {
  const parse = (s: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  };
  const da = parse(a);
  const db = parse(b);
  if (da == null || db == null) return 0;
  return da - db;
}

function todayDisplay(): string {
  const now = new Date();
  const d = now.getDate().toString().padStart(2, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export function parseAdditionalFlightsCsv(text: string): AdditionalFlightsCsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      rows: [],
      skipped: [{ rowNumber: 0, reason: 'CSV must include a header row and at least one data row.' }],
    };
  }

  const headerCells = parseCsvLine(lines[0]);
  const normalizedHeaders = headerCells.map(normalizeHeader);

  const isGatewaySchedule = GATEWAY_SCHEDULE_HEADERS.some((h) => normalizedHeaders.includes(h));
  if (isGatewaySchedule) {
    return {
      rows: [],
      skipped: [
        {
          rowNumber: 0,
          reason:
            'This file looks like a Gateway Scheduled Airlines export. Use the Additional Flights CSV template instead.',
        },
      ],
    };
  }

  const rows: ParsedAdditionalFlightCsvRow[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];
  const today = todayDisplay();

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;

    const row: Record<string, string> = {};
    for (let c = 0; c < headerCells.length; c++) {
      row[normalizeHeader(headerCells[c])] = cells[c] ?? '';
    }

    const airlines = pickField(row, 'Airlines', 'airlines', 'Airline');
    const flightNo = pickField(row, 'Flight No', 'flight no', 'flightNo');
    if (!airlines) {
      skipped.push({ rowNumber, reason: 'Airlines is required.' });
      continue;
    }
    if (!flightNo) {
      skipped.push({ rowNumber, reason: 'Flight No is required.' });
      continue;
    }

    const staDate =
      normalizeDate(pickField(row, 'STA Date', 'sta date', 'date', 'STA')) ?? '';
    const stdDate =
      normalizeDate(pickField(row, 'STD Date', 'std date', 'date2', 'STD')) ?? '';

    if (!staDate || !stdDate) {
      skipped.push({ rowNumber, reason: 'STA Date and STD Date are required (dd/MM/yyyy).' });
      continue;
    }
    if (compareDisplayDates(staDate, today) < 0) {
      skipped.push({ rowNumber, reason: 'STA Date must be today or a future date.' });
      continue;
    }
    if (compareDisplayDates(staDate, stdDate) > 0) {
      skipped.push({ rowNumber, reason: 'STA Date cannot be after STD Date.' });
      continue;
    }

    rows.push({
      rowNumber,
      payload: {
        airlines,
        flightNo,
        acType: pickField(row, 'AC Type', 'ac type', 'acType', 'Aircraft'),
        aBody: pickField(row, 'A Body', 'a body', 'aBody', 'Aircraft Body') || 'NB',
        airlineCode: pickField(row, 'Airline Code', 'airline code', 'airlineCode'),
        routing: pickField(row, 'Routing', 'routing'),
        staTime: pickField(row, 'STA Time', 'sta time', 'staTime') || '00:00',
        stdTime: pickField(row, 'STD Time', 'std time', 'stdTime') || '00:00',
        date: staDate,
        date2: stdDate,
        opsType: pickField(row, 'Ops Type', 'ops type', 'opsType') || 'Turnaround',
        skdNonSkd: pickField(row, 'Skd/Non Skd', 'skd/non skd', 'skdNonSkd') || 'Additional',
        freighter: pickField(row, 'Freighter', 'freighter'),
        categoryOfFlight:
          pickField(row, 'Category Of Flight', 'category of flight', 'categoryOfFlight') ||
          'International',
      },
    });
  }

  return { rows, skipped };
}

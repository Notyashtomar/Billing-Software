/** Parse dd/MM/yyyy or yyyy-MM-dd into dd/MM/yyyy display format. */
export function normalizeImportDate(value: string): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const ddMmYyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (ddMmYyyy) {
    const d = Number(ddMmYyyy[1]);
    const m = Number(ddMmYyyy[2]);
    const y = Number(ddMmYyyy[3]);
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d
    ) {
      return raw;
    }
    return null;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d
    ) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
  }

  return null;
}

export function compareDisplayDates(a: string, b: string): number {
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

export function compareTimes(a: string, b: string): number {
  const pa = /^(\d{2}):(\d{2})$/.exec(a);
  const pb = /^(\d{2}):(\d{2})$/.exec(b);
  if (!pa || !pb) return 0;
  const ma = Number(pa[1]) * 60 + Number(pa[2]);
  const mb = Number(pb[1]) * 60 + Number(pb[2]);
  return ma - mb;
}

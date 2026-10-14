import { BadRequestException } from '@nestjs/common';

const MAX_RANGE_DAYS = 366;

export function parseDdMmYyyy(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDdMmYyyy(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function enumerateDdMmYyyyRange(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  maxDays = MAX_RANGE_DAYS,
): string[] {
  const from = parseDdMmYyyy(fromDdMmYyyy);
  const to = parseDdMmYyyy(toDdMmYyyy);
  if (!from || !to) {
    throw new BadRequestException('fromDate and toDate must be valid dd/MM/yyyy values.');
  }

  const start = from.getTime() <= to.getTime() ? from : to;
  const end = from.getTime() <= to.getTime() ? to : from;
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
  if (totalDays > maxDays) {
    throw new BadRequestException(`Date range cannot exceed ${maxDays} days.`);
  }

  const out: string[] = [];
  for (let i = 0; i < totalDays; i++) {
    out.push(formatDdMmYyyy(new Date(start.getTime() + i * dayMs)));
  }
  return out;
}

export function normalizeCreationDateRange(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
): { fromDate: string; toDate: string } {
  const fromRaw = String(fromDdMmYyyy ?? '').trim();
  const toRaw = String(toDdMmYyyy ?? '').trim();
  if (!fromRaw || !toRaw) {
    throw new BadRequestException('fromDate and toDate query parameters are required (dd/MM/yyyy).');
  }
  const from = parseDdMmYyyy(fromRaw);
  const to = parseDdMmYyyy(toRaw);
  if (!from || !to) {
    throw new BadRequestException('fromDate and toDate must be valid dd/MM/yyyy values.');
  }
  if (from.getTime() <= to.getTime()) {
    return { fromDate: fromRaw, toDate: toRaw };
  }
  return { fromDate: toRaw, toDate: fromRaw };
}

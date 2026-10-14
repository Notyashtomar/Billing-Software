import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BhsMisExportInput } from './billing-mis-bhs-export.util';
import { delhiRevSummaryHeaders, type BhsMisStationProfile } from './billing-mis-bhs-profile.util';
import { buildRecoSkdMatrix } from './billing-mis-bhs-reco-skd.util';

function resolveOpenpyxlScriptPath(): string | null {
  const candidates = [
    join(__dirname, '..', 'scripts', 'export-bhs-mis-openpyxl.py'),
    join(process.cwd(), 'modules', 'm-billing', 'server', 'scripts', 'export-bhs-mis-openpyxl.py'),
    join(process.cwd(), '..', '..', 'modules', 'm-billing', 'server', 'scripts', 'export-bhs-mis-openpyxl.py'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function pythonCandidates(): string[] {
  if (process.platform === 'win32') return ['python', 'py', 'python3'];
  return ['python3', 'python'];
}

function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${cmd} exited ${code}`));
    });
  });
}

async function runPythonScript(scriptPath: string, payloadPath: string): Promise<void> {
  let lastError: Error | null = null;
  for (const cmd of pythonCandidates()) {
    try {
      await runProcess(cmd, [scriptPath, payloadPath]);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('Python not available for BHS MIS export');
}

function serializePayload(
  input: BhsMisExportInput,
  templatePath: string,
  outputPath: string,
  profile: BhsMisStationProfile,
): Record<string, unknown> {
  const dateOnly = (value?: Date | string): string | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };

  return {
    templatePath,
    outputPath,
    stationCode: input.stationCode,
    stationLabel: profile.stationLabel,
    from: input.from,
    to: input.to,
    roeToInr: input.roeToInr,
    previousRoeToInr: input.previousRoeToInr,
    revHeaders: delhiRevSummaryHeaders(input.from),
    profile: {
      sheets: profile.sheets,
      scheduleSheet: profile.scheduleSheet,
      projSheet: profile.projSheet,
      recoSheet: profile.recoSheet,
      revSummarySheet: profile.revSummarySheet,
      layout: profile.layout,
    },
    flights: input.flights,
    lastMonthFlights: input.lastMonthFlights ?? [],
    scheduleMasters: input.scheduleMasters ?? [],
    reco: buildRecoSkdMatrix(
      input.scheduleMasters ?? [],
      input.fhrFlights ?? input.flights,
      input.lastMonthFlights ?? input.flights,
      input.from,
      input.to,
    ),
    priceCardRows: input.priceCardRows.map((row) => ({
      ...row,
      validFrom: dateOnly(row.validFrom),
      validTo: dateOnly(row.validTo),
    })),
    invoices: input.invoices.map((row) => ({
      ...row,
      billingPeriodStart: dateOnly(row.billingPeriodStart),
      billingPeriodEnd: dateOnly(row.billingPeriodEnd),
    })),
    previousInvoices: (input.previousInvoices ?? []).map((row) => ({
      ...row,
      billingPeriodStart: dateOnly(row.billingPeriodStart),
      billingPeriodEnd: dateOnly(row.billingPeriodEnd),
    })),
    revRows: input.revRows ?? [],
  };
}

/** Template-safe export via openpyxl (preserves formulas). Returns null when Python/openpyxl unavailable. */
export async function exportBhsMisViaOpenpyxl(
  input: BhsMisExportInput,
  templatePath: string,
  profile: BhsMisStationProfile,
): Promise<Buffer | null> {
  const scriptPath = resolveOpenpyxlScriptPath();
  if (!scriptPath) return null;

  const workDir = mkdtempSync(join(tmpdir(), 'bhs-mis-export-'));
  const payloadPath = join(workDir, 'payload.json');
  const outputPath = join(workDir, 'output.xlsx');

  writeFileSync(payloadPath, JSON.stringify(serializePayload(input, templatePath, outputPath, profile)));

  try {
    await runPythonScript(scriptPath, payloadPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|ENOENT|spawn/i.test(message)) {
      return null;
    }
    throw new Error(`BHS MIS openpyxl export failed: ${message}`);
  }

  try {
    if (!existsSync(outputPath)) {
      throw new Error('BHS MIS openpyxl export produced no output file');
    }
    return readFileSync(outputPath);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdsMisExportInput } from './billing-mis-ads-export.util';
import type { AdsMisStationProfile } from './billing-mis-ads-profile.util';

function resolveOpenpyxlScriptPath(): string | null {
  const candidates = [
    join(__dirname, '..', 'scripts', 'export-ads-mis-openpyxl.py'),
    join(process.cwd(), 'modules', 'm-billing', 'server', 'scripts', 'export-ads-mis-openpyxl.py'),
    join(process.cwd(), '..', '..', 'modules', 'm-billing', 'server', 'scripts', 'export-ads-mis-openpyxl.py'),
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

function runProcess(cmd: string, args: string[], timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
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
  throw lastError ?? new Error('Python not available for ADS MIS export');
}

function serializePayload(
  input: AdsMisExportInput,
  templatePath: string,
  outputPath: string,
  profile: AdsMisStationProfile,
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
    profile: {
      sheets: profile.sheets,
    },
    equipmentRows: input.equipmentRows,
    invoices: input.invoices.map((row) => ({
      ...row,
      billingPeriodStart: dateOnly(row.billingPeriodStart),
      billingPeriodEnd: dateOnly(row.billingPeriodEnd),
    })),
    billingRows: input.billingRows ?? [],
  };
}

/** Template-safe export via openpyxl (preserves formulas). Returns null when Python/openpyxl unavailable. */
export async function exportAdsMisViaOpenpyxl(
  input: AdsMisExportInput,
  templatePath: string,
  profile: AdsMisStationProfile,
): Promise<Buffer | null> {
  const scriptPath = resolveOpenpyxlScriptPath();
  if (!scriptPath) return null;

  const workDir = mkdtempSync(join(tmpdir(), 'ads-mis-export-'));
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
    throw new Error(`ADS MIS openpyxl export failed: ${message}`);
  }

  try {
    if (!existsSync(outputPath)) {
      throw new Error('ADS MIS openpyxl export produced no output file');
    }
    return readFileSync(outputPath);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

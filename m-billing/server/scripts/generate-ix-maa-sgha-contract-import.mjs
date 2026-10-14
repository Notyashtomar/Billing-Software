/**
 * @deprecated Use generate-maa-contract-import-from-price-card.mjs
 * Thin wrapper for IX-only regeneration from the shared price-card parser.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainScript = join(__dirname, 'generate-maa-contract-import-from-price-card.mjs');

const result = spawnSync(process.execPath, [mainScript, '--as-of', '2026-08-15', '--per-airline'], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

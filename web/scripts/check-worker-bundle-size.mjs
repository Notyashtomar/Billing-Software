/**
 * Fail CI when the OpenNext Worker bundle exceeds the project gzip budget.
 * Run after: npx opennextjs-cloudflare build
 *
 * Project gate is 10 MiB gzip to match the current Cloudflare Worker plan.
 * Cloudflare validates wrangler's combined Worker script gzip (not handler.mjs alone).
 */
import { execSync } from 'node:child_process';

const MAX_TOTAL_GZIP_KIB = 10 * 1024;

let output = '';
try {
  output = execSync('npx wrangler deploy --dry-run', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
}

const match = output.match(/Total Upload:[\s\S]*?gzip:\s*([\d.]+)\s*KiB/i);
if (!match) {
  console.error('Could not parse wrangler dry-run gzip size.');
  console.error(output.slice(-4000));
  process.exit(1);
}

const totalGzipKiB = Number(match[1]);
console.log(
  `Worker total gzip: ${totalGzipKiB.toFixed(1)} KiB (project limit ${MAX_TOTAL_GZIP_KIB} KiB / 10 MiB)`,
);

if (totalGzipKiB > MAX_TOTAL_GZIP_KIB) {
  console.error(
    `Worker bundle exceeds 10 MiB gzip project limit (${MAX_TOTAL_GZIP_KIB} KiB). ` +
      'Lazy-load heavy client libs, split operational Hono routes, or move generation to Railway.',
  );
  process.exit(1);
}

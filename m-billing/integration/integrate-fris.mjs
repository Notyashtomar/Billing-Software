#!/usr/bin/env node
/**
 * Copy billing module into FRIS server/client and fix import paths.
 * Usage: node BWMS/modules/m-billing/integration/integrate-fris.mjs
 *
 * Source of truth (Approach C):
 *   api/     → server/src/billing/
 *   domain/  → server/src/billing/shared + client/lib/billing-shared
 *   web/     → client/components/billing (+ optional pages)
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');
const BILLING_API = resolve(__dirname, '../api/src');
const BILLING_WEB = resolve(__dirname, '../web');
const BILLING_DOMAIN = resolve(__dirname, '../domain/src');
const FRIS_SERVER_BILLING = resolve(ROOT, 'BWMS/apps/api/src/billing');
const FRIS_CLIENT_COMPONENTS = resolve(ROOT, 'BWMS/modules/m-billing/client/components/billing');
const FRIS_CLIENT_SHARED = resolve(ROOT, 'BWMS/modules/m-platform/client/lib/billing-shared');
const FRIS_SERVER_SHARED = resolve(FRIS_SERVER_BILLING, 'shared');

function copyDir(src, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (/\.(ts|tsx)$/.test(name)) fn(p);
  }
}

console.log('1. Copy api (Nest billing module)...');
copyDir(BILLING_API, FRIS_SERVER_BILLING);

console.log('2. Copy domain types...');
copyDir(BILLING_DOMAIN, FRIS_SERVER_SHARED);
copyDir(BILLING_DOMAIN, FRIS_CLIENT_SHARED);

console.log('3. Copy web components...');
copyDir(join(BILLING_WEB, 'components/billing'), FRIS_CLIENT_COMPONENTS);

console.log('4. Fix server domain imports...');
walk(FRIS_SERVER_BILLING, (file) => {
  if (file.includes(`${join('billing', 'shared')}`)) return;
  let text = readFileSync(file, 'utf8');
  const rel = relative(dirname(file), FRIS_SERVER_SHARED).replace(/\\/g, '/');
  text = text.replace(/from ['"](\.\.\/)+(?:shared|domain)\/src\/([^'"]+)['"]/g, `from '${rel}/$2'`);
  writeFileSync(file, text);
});

console.log('5. Fix client domain imports...');
walk(FRIS_CLIENT_COMPONENTS, (file) => {
  let text = readFileSync(file, 'utf8');
  text = text.replace(
    /from ['"](\.\.\/)+(?:shared|domain)\/src\/([^'"]+)['"]/g,
    "from '@/lib/billing-shared/$2'",
  );
  text = text.replace(/from ['"]\.\.\/\.\.\/lib\/billing-api['"]/g, "from '@/lib/billing-api'");
  writeFileSync(file, text);
});

console.log('Done copying. Apply manual patches via integrate-fris-patches (next step).');

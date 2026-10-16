/**
 * Link Nest domain folders into api/src.
 * Those directories are gitignored mounts. Sources live under m-*.
 * Admin domains come from m-admin/server (same layout as the FRIS repo).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiSrc = path.join(repo, 'api', 'src');

const PLATFORM = ['auth', 'user', 'common', 'health', 'protection'];
const ADMIN = [
  'admin',
  'admin-access-control',
  'admin-audit',
  'admin-companies',
  'admin-departments',
  'admin-incidents',
  'admin-messaging',
  'admin-notifications',
  'admin-stations',
  'employees',
  'operation-employees',
  'training-matrix',
  'user-activity-notifications',
];
const FRIS = [
  'advance-aircraft',
  'advance-aircraft-registration',
  'advance-airline',
  'advance-airline-logo',
  'advance-ams-services',
  'advance-cargo',
  'advance-contact',
  'advance-dcs-master',
  'advance-equipment',
  'advance-gateway-scheduled-airline',
  'advance-ghrep',
  'advance-invoicing',
  'advance-manpower',
  'advance-non-scheduled-airline',
  'advance-ns-contact',
  'advance-ns-ghrep',
  'advance-other-services',
  'advance-raf-airline',
  'advance-schedule-equipment',
  'advance-staff',
  'advance-terminal',
  'attachments',
  'creation',
  'dashboard-data',
  'dashboard-kpi-flights',
  'dashboard-summary',
  'equipment-details',
  'equipment-manpower',
  'excel-import',
  'fhr-collection',
  'flight-cancellations',
  'flight-instance-state',
  'flights-reference',
  'import',
  'load-control-details',
  'main-details',
  'manifest',
  'mis-station-wise',
  'non-scheduled-booking',
  'ns-fhr-collection',
  'pax-duty-allocation',
  'performance-flights',
  'psr-employee-sections',
  'psr-flight-details',
  'psr-sick-leave',
  'ramp-details-1',
  'ramp-details-2',
  'ramp-details-3',
  'raw-flight-data',
  'raf-collection',
  'remarks',
  'reports',
  'reports-pax-shift-report',
  'reports-ramp-shift-report',
  'representative-signatures',
  'shipped-bags',
  'sta-ata-daily',
  'terminal-details',
];

const mounts = [];

function add(name, source) {
  mounts.push({ name, source });
}

for (const name of PLATFORM) {
  add(name, path.join(repo, 'm-platform', 'server', name));
}
for (const name of ADMIN) {
  add(name, path.join(repo, 'm-admin', 'server', name));
}
for (const name of FRIS) {
  add(name, path.join(repo, 'm-fris', 'server', name));
}
add('billing', path.join(repo, 'm-billing', 'server', 'src'));

function sameTarget(linkPath, source) {
  try {
    return path.resolve(fs.realpathSync(linkPath)) === path.resolve(source);
  } catch {
    return false;
  }
}

function removeJunction(dest) {
  execFileSync('cmd', ['/c', 'rmdir', dest], { stdio: 'pipe' });
}

fs.mkdirSync(apiSrc, { recursive: true });

const honoMount = path.join(apiSrc, 'hono');
if (fs.existsSync(honoMount)) {
  const stat = fs.lstatSync(honoMount);
  if (stat.isSymbolicLink() || path.resolve(fs.realpathSync(honoMount)) !== path.resolve(honoMount)) {
    removeJunction(honoMount);
    console.log('removed extra api/src/hono mount');
  }
}

let mounted = 0;
for (const { name, source } of mounts) {
  if (!fs.existsSync(source)) {
    console.warn(`skip missing target: ${path.relative(repo, source)}`);
    continue;
  }
  const dest = path.join(apiSrc, name);
  if (fs.existsSync(dest)) {
    if (sameTarget(dest, source)) continue;
    throw new Error(`Refusing to replace existing path: ${dest}`);
  }
  fs.symlinkSync(source, dest, 'junction');
  mounted += 1;
  console.log(`mounted ${path.relative(repo, dest)} -> ${path.relative(repo, source)}`);
}

console.log(`module mounts ready (${mounted} new)`);

function mountReexport(sourceFile, destFile) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const spec = path
    .relative(path.dirname(destFile), sourceFile)
    .replace(/\\/g, '/')
    .replace(/\.(tsx|ts)$/, '');
  const body = `export { default } from '${spec}';\n`;
  const current = fs.existsSync(destFile) ? fs.readFileSync(destFile, 'utf8') : '';
  if (current !== body) {
    fs.writeFileSync(destFile, body);
    return true;
  }
  return false;
}

function mountRouteTree(sourceRoot, destRoot) {
  if (!fs.existsSync(sourceRoot)) return 0;
  let wrote = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      const dest = path.join(destRoot, path.relative(sourceRoot, full));
      if (mountReexport(full, dest)) wrote += 1;
    }
  }
  walk(sourceRoot);
  return wrote;
}

const loginWrote = mountReexport(
  path.join(repo, 'm-platform', 'client', 'app', 'login', 'page.tsx'),
  path.join(repo, 'web', 'app', 'login', 'page.tsx'),
);
if (loginWrote) console.log('mounted web/app/login/page.tsx');

const billingWrote = mountRouteTree(
  path.join(repo, 'm-billing', 'client', 'app', 'billing'),
  path.join(repo, 'web', 'app', 'billing'),
);
if (billingWrote) console.log(`mounted web/app/billing (${billingWrote} files)`);

#!/usr/bin/env node
/**
 * Unit test runner.
 *
 * Why not plain `jest`? Two Windows quirks hide most module specs:
 *   1. api/src/<module> folders are junctions; Jest's default rootDir crawl
 *      does not follow them.
 *   2. Files synced by OneDrive / cloud storage carry a ReparsePoint
 *      attribute. Node's `Dirent.isSymbolicLink()` reports them as symlinks
 *      and Jest's crawler silently drops them.
 *
 * This script enumerates *.spec.ts itself (using plain fs, which reads the
 * files fine) and hands the list to Jest with --runTestsByPath, bypassing the
 * haste-map crawl entirely.
 *
 * Usage:
 *   node test/run-unit-tests.cjs                 # all unit specs
 *   node test/run-unit-tests.cjs m-billing       # only paths containing "m-billing"
 *   node test/run-unit-tests.cjs concession -- --verbose
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..');

const args = process.argv.slice(2);
const dashDash = args.indexOf('--');
const filters = (dashDash === -1 ? args : args.slice(0, dashDash)).filter(
  (a) => !a.startsWith('-'),
);
const jestArgs = dashDash === -1 ? [] : args.slice(dashDash + 1);

function walkSpecs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walkSpecs(p, out);
    } else if (p.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

const moduleRoots = fs
  .readdirSync(repoRoot, { withFileTypes: true })
  .filter((ent) => ent.isDirectory() && /^m-/.test(ent.name))
  .map((ent) => path.join(repoRoot, ent.name, 'server'))
  .filter((p) => fs.existsSync(p));

// Only top-level api/src specs; sub-folders are junction mirrors of modules.
const apiSrc = path.join(apiRoot, 'src');
const apiSpecs = fs
  .readdirSync(apiSrc, { withFileTypes: true })
  .filter((ent) => !ent.isDirectory() && ent.name.endsWith('.spec.ts'))
  .map((ent) => path.join(apiSrc, ent.name));

// Modules import each other with relative paths that only resolve through the
// api/src/<module> junctions (e.g. ../../common/station). Run every module spec
// through its junction path so those imports work the same way as at runtime.
const junctionByTarget = new Map();
for (const ent of fs.readdirSync(apiSrc, { withFileTypes: true })) {
  const mount = path.join(apiSrc, ent.name);
  let target;
  try {
    target = fs.readlinkSync(mount);
  } catch {
    continue;
  }
  junctionByTarget.set(path.resolve(target).replace(/\\/g, '/').replace(/\/$/, ''), mount);
}

function toJunctionPath(realSpecPath) {
  const normalized = realSpecPath.replace(/\\/g, '/');
  let best = null;
  for (const [target, mount] of junctionByTarget) {
    if (normalized.startsWith(`${target}/`) && (!best || target.length > best.target.length)) {
      best = { target, mount };
    }
  }
  if (!best) return realSpecPath;
  return path.join(best.mount, normalized.slice(best.target.length + 1));
}

let specs = [...apiSpecs, ...moduleRoots.flatMap((root) => walkSpecs(root)).map(toJunctionPath)]
  .map((p) => p.replace(/\\/g, '/'))
  .sort();

if (filters.length > 0) {
  specs = specs.filter((p) => filters.some((f) => p.includes(f)));
}

if (specs.length === 0) {
  console.error(`No spec files matched ${filters.length ? filters.join(', ') : '(all)'}.`);
  process.exit(1);
}

console.log(`Running ${specs.length} spec file(s)${filters.length ? ` matching ${filters.join(', ')}` : ''}.`);

const result = spawnSync(
  process.execPath,
  [
    '--preserve-symlinks',
    path.join(apiRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
    '--config',
    path.join(__dirname, 'jest-unit.config.cjs'),
    '--runInBand',
    ...jestArgs,
    '--runTestsByPath',
    ...specs,
  ],
  { stdio: 'inherit', cwd: apiRoot },
);

process.exit(result.status ?? 1);

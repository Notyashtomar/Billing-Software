/**
 * Unit test discovery for the modular layout.
 *
 * Default Jest + rootDir "src" skips Windows junctions under api/src, so
 * module specs under the m-<name>/server folders never run. This config
 * crawls the real module folders instead.
 *
 * Layout:
 *   <repo>/api                 (this Nest app; test/ is here)
 *   <repo>/m-billing/server    (mounted at api/src/billing)
 *   <repo>/m-fris/server, m-admin/server, m-platform/server
 */
const path = require('path');
const fs = require('fs');

// test/ → api → <repo>
const repoRoot = path.resolve(__dirname, '../..');
const apiRoot = path.join(repoRoot, 'api');
const moduleRoots = fs
  .readdirSync(repoRoot, { withFileTypes: true })
  .filter((ent) => ent.isDirectory() && /^m-/.test(ent.name))
  .map((ent) => path.join(repoRoot, ent.name, 'server'))
  .filter((p) => fs.existsSync(p));

/** @type {import('jest').Config} */
module.exports = {
  rootDir: repoRoot,
  // Crawl only real module folders plus the api root itself (not the
  // junctioned api/src/<module> mirrors, which would double-run every spec).
  roots: [path.join(apiRoot, 'src'), ...moduleRoots],
  watchman: false,
  // Files synced by OneDrive / cloud storage carry a ReparsePoint attribute,
  // which Jest's crawler treats as a symlink and silently skips. Follow them.
  haste: { enableSymlinks: true },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    // api/test holds e2e + smoke specs with their own configs.
    '/api/test/',
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      path.join(apiRoot, 'node_modules', 'ts-jest'),
      { tsconfig: path.join(__dirname, 'tsconfig.jest.json'), diagnostics: false },
    ],
  },
  moduleNameMapper: {
    // Resolve src/* through mounted API junctions (same layout as Nest runtime)
    '^src/(.*)$': path.join(apiRoot, 'src', '$1'),
  },
  // Do not realpath junctions; relative cross-module imports need the api/src layout.
  resolver: path.join(__dirname, 'jest-preserve-symlinks-resolver.cjs'),
  modulePaths: [path.join(apiRoot, 'node_modules')],
  moduleDirectories: ['node_modules', path.join(apiRoot, 'node_modules')],
  testTimeout: 60000,
  forceExit: true,
};

/**
 * Unit test discovery for BWMS Approach C.
 *
 * Default Jest + rootDir "src" skips Windows junctions under apps/api/src, so
 * module specs under BWMS/modules never run. This config enumerates real paths.
 */
const path = require('path');
const fs = require('fs');

// test/ → apps/api → apps → BWMS
const bwmsRoot = path.resolve(__dirname, '../../..');
const apiRoot = path.join(bwmsRoot, 'apps', 'api');
const modulesRoot = path.join(bwmsRoot, 'modules');

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

const testMatch = [
  path.join(apiRoot, 'src', '**', '*.spec.ts'),
  ...walkSpecs(modulesRoot),
];

/** @type {import('jest').Config} */
module.exports = {
  rootDir: bwmsRoot,
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch,
  transform: {
    '^.+\\.(t|j)s$': [
      path.join(apiRoot, 'node_modules', 'ts-jest'),
      { tsconfig: path.join(__dirname, 'tsconfig.jest.json') },
    ],
  },
  moduleNameMapper: {
    // Resolve src/* through mounted API junctions (same layout as Nest runtime)
    '^src/(.*)$': path.join(apiRoot, 'src', '$1'),
  },
  modulePaths: [path.join(apiRoot, 'node_modules')],
  moduleDirectories: ['node_modules', path.join(apiRoot, 'node_modules')],
  testTimeout: 60000,
  forceExit: true,
};

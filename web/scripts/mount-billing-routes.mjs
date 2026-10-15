import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(webRoot, '..');
const srcRoot = path.join(repo, 'm-billing', 'client', 'app', 'billing');
const dstRoot = path.join(webRoot, 'app', 'billing');

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(ent.name)) continue;
    const out = path.join(dstRoot, path.relative(srcRoot, full));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ups = path.relative(repo, path.dirname(out)).split(path.sep).length;
    const spec =
      '../'.repeat(ups) +
      path.relative(repo, full).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '');
    fs.writeFileSync(out, `export { default } from '${spec}';\n`);
  }
}

walk(srcRoot);
console.log('mounted', dstRoot);

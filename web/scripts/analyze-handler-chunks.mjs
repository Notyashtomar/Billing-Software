import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const chunksDir = path.join(process.cwd(), '.open-next/server-functions/default/.next/server/chunks');
if (!fs.existsSync(chunksDir)) {
  console.error('Run opennext build first');
  process.exit(1);
}

const files = fs.readdirSync(chunksDir).filter((f) => f.endsWith('.js'));
const rows = files
  .map((f) => {
    const buf = fs.readFileSync(path.join(chunksDir, f));
    return {
      file: f,
      rawKiB: buf.length / 1024,
      gzipKiB: zlib.gzipSync(buf).length / 1024,
    };
  })
  .sort((a, b) => b.gzipKiB - a.gzipKiB);

console.log('Top server chunks by gzip size:');
for (const row of rows.slice(0, 20)) {
  console.log(`${row.gzipKiB.toFixed(1)} KiB gzip  ${row.rawKiB.toFixed(0)} KiB raw  ${row.file}`);
}

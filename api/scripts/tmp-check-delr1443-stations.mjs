import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../.env'), 'utf8');
const uri = env
  .split(/\r?\n/)
  .find((l) => l.startsWith('MONGO_URI='))
  ?.slice('MONGO_URI='.length)
  .trim();

await mongoose.connect(uri);
const db = mongoose.connection.db;

const ids = [
  '6a27a8cc9678fc8ca81dbe63',
  '6a27a8cc9678fc8ca81dbe6b',
  '6a27a8cc9678fc8ca81dbe5f',
];

const assigned = await db
  .collection('admin-stations')
  .find({
    _id: {
      $in: ids.map((id) => new mongoose.Types.ObjectId(id)),
    },
  })
  .project({ stationCode: 1, code: 1, city: 1, name: 1, status: 1 })
  .toArray();

const allDel = await db
  .collection('admin-stations')
  .find({
    $or: [{ stationCode: /^DEL$/i }, { code: /^DEL/i }, { city: /delhi/i }],
  })
  .project({ stationCode: 1, code: 1, city: 1, name: 1, status: 1 })
  .toArray();

const user = await db.collection('users').findOne({ userid: 'DELR1443' });
const perms = user?.stationPermissions || {};
const permSummary = Object.fromEntries(
  Object.entries(perms).map(([k, v]) => [
    k,
    {
      tabs: v?.accessTabs?.length ?? 0,
      pages: Object.values(v?.accessSubPages || {}).flat().length,
    },
  ]),
);

console.log(
  JSON.stringify(
    {
      assignedStations: assigned.map((s) => ({
        _id: String(s._id),
        stationCode: s.stationCode,
        code: s.code,
        city: s.city,
        name: s.name,
        status: s.status,
      })),
      allDelhiLike: allDel.map((s) => ({
        _id: String(s._id),
        stationCode: s.stationCode,
        code: s.code,
        city: s.city,
        name: s.name,
        status: s.status,
      })),
      permSummary,
      stationAppAccessKeys: Object.keys(user?.stationAppAccess || {}),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();

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

const DEL = '6a27a8cc9678fc8ca81dbe5f';
const MAA = '6a27a8cc9678fc8ca81dbe63';

await mongoose.connect(uri);
const db = mongoose.connection.db;
const user = await db.collection('users').findOne({ userid: 'DELR1443' });
if (!user) {
  console.error('user missing');
  process.exit(1);
}

const donor = user.stationPermissions?.[MAA] || user.stationPermissions?.[Object.keys(user.stationPermissions || {})[0]];
const nextPerms = { ...(user.stationPermissions || {}) };
if (donor) {
  nextPerms[DEL] = {
    accessTabs: [...(donor.accessTabs || [])],
    accessSubPages: { ...(donor.accessSubPages || {}) },
  };
}

await db.collection('users').updateOne(
  { userid: 'DELR1443' },
  {
    $set: {
      stationPermissions: nextPerms,
      station: 'Indira Gandhi International Airport (DEL)',
    },
  },
);

const after = await db.collection('users').findOne({ userid: 'DELR1443' });
console.log(
  JSON.stringify(
    {
      assigned: (after?.assignedStationIds || []).map(String),
      permKeys: Object.keys(after?.stationPermissions || {}),
      delTabs: after?.stationPermissions?.[DEL]?.accessTabs?.length ?? 0,
      authorizationRole: after?.authorizationRole,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();

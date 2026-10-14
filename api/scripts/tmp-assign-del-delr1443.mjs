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
const IXC = '6a27a8cc9678fc8ca81dbe6b';

await mongoose.connect(uri);
const db = mongoose.connection.db;

const before = await db.collection('users').findOne({ userid: 'DELR1443' });
console.log('BEFORE assigned', (before?.assignedStationIds || []).map(String));

// Simulate stations-step save: set assigned including DEL, keep existing stationPermissions
const nextAssigned = [MAA, IXC, DEL];
const existingPerms = before?.stationPermissions || {};

await db.collection('users').updateOne(
  { userid: 'DELR1443' },
  {
    $set: {
      assignedStationIds: nextAssigned.map((id) => new mongoose.Types.ObjectId(id)),
      station: 'Indira Gandhi International Airport (DEL)',
      // leave stationPermissions as-is (stations step does not send perms)
    },
  },
);

const after = await db.collection('users').findOne({ userid: 'DELR1443' });
console.log('AFTER assigned', (after?.assignedStationIds || []).map(String));
console.log('AFTER perm keys', Object.keys(after?.stationPermissions || {}));

await mongoose.disconnect();

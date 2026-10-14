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

if (!uri) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

const user = await db.collection('users').findOne({
  $or: [
    { userid: 'DELR1443' },
    { employeeId: 'DELR1443' },
    { userid: /DELR1443/i },
    { employeeId: /DELR1443/i },
  ],
});

const admin = await db.collection('admins').findOne({
  $or: [{ userid: 'DELR1443' }, { userid: /DELR1443/i }],
});

const collNames = (await db.listCollections().toArray()).map((c) => c.name);
const stationColl =
  collNames.find((n) => /admin.?station/i.test(n)) ||
  collNames.find((n) => n === 'stations') ||
  'stations';

const stations = await db
  .collection(stationColl)
  .find({
    $or: [
      { stationCode: /DEL/i },
      { code: /DEL/i },
      { city: /delhi/i },
      { name: /delhi/i },
      { airport: /indira/i },
    ],
  })
  .project({
    _id: 1,
    stationCode: 1,
    code: 1,
    city: 1,
    name: 1,
    airport: 1,
    status: 1,
  })
  .limit(30)
  .toArray();

console.log(
  JSON.stringify(
    {
      stationColl,
      user: user
        ? {
            _id: String(user._id),
            userid: user.userid,
            employeeId: user.employeeId,
            role: user.role,
            authorizationRole: user.authorizationRole,
            assignedStationIds: (user.assignedStationIds || []).map(String),
            stationPermissionsKeys: Object.keys(user.stationPermissions || {}),
            station: user.station,
            stationCode: user.stationCode,
          }
        : null,
      admin: admin
        ? {
            _id: String(admin._id),
            userid: admin.userid,
            role: admin.role,
            stationId: admin.stationId ? String(admin.stationId) : null,
            assignedStationIds: (admin.assignedStationIds || []).map(String),
            isGlobalAdmin: admin.isGlobalAdmin,
          }
        : null,
      stations: stations.map((s) => ({
        _id: String(s._id),
        stationCode: s.stationCode,
        code: s.code,
        city: s.city,
        name: s.name,
        airport: s.airport,
        status: s.status,
      })),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();

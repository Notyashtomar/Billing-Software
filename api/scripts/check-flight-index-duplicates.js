const mongoose = require('mongoose');
const { Logger } = require('@nestjs/common');

const logger = new Logger('CheckFlightIndexDuplicates');

async function run() {
  const uri = process.env.MONGO_URI || '';
  if (!uri) {
    throw new Error('MONGO_URI missing');
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const coll = db.collection('flight_instance_index');

  const dupSerial = await coll
    .aggregate([
      {
        $group: {
          _id: '$serialNo',
          count: { $sum: 1 },
          instanceKeys: { $addToSet: '$instanceKey' },
          dates: { $addToSet: '$operationDate' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ])
    .toArray();

  const dupInstanceKey = await coll
    .aggregate([
      {
        $group: {
          _id: '$instanceKey',
          count: { $sum: 1 },
          serials: { $addToSet: '$serialNo' },
          dates: { $addToSet: '$operationDate' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ])
    .toArray();

  logger.log(`dupSerialCount=${dupSerial.length}`);
  if (dupSerial.length) {
    logger.log(JSON.stringify(dupSerial, null, 2));
  }
  logger.log(`dupInstanceKeyCount=${dupInstanceKey.length}`);
  if (dupInstanceKey.length) {
    logger.log(JSON.stringify(dupInstanceKey, null, 2));
  }
}

run()
  .catch((err) => {
    logger.error(err instanceof Error ? err.stack : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });

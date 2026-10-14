const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Logger } = require('@nestjs/common');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const logger = new Logger('ExportMongoDbSchema');

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value) &&
    !(value && value._bsontype === 'ObjectId')
  );
}

function normalizeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (Buffer.isBuffer(value)) return 'buffer';
  if (value && value._bsontype === 'ObjectId') return 'objectId';
  if (value && value._bsontype === 'Decimal128') return 'decimal128';
  const t = typeof value;
  if (t === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (t === 'string' || t === 'boolean' || t === 'object') return t;
  return 'unknown';
}

function inferCollectionSchema(docs) {
  const fields = new Map();

  function ensure(pathKey) {
    if (!fields.has(pathKey)) {
      fields.set(pathKey, { types: new Set(), count: 0 });
    }
    return fields.get(pathKey);
  }

  function walk(value, pathKey, seenInDoc) {
    if (pathKey) {
      const stat = ensure(pathKey);
      stat.types.add(normalizeType(value));
      if (!seenInDoc.has(pathKey)) {
        stat.count += 1;
        seenInDoc.add(pathKey);
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, pathKey ? `${pathKey}[]` : '[]', seenInDoc);
      }
      return;
    }

    if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        const next = pathKey ? `${pathKey}.${k}` : k;
        walk(v, next, seenInDoc);
      }
    }
  }

  for (const doc of docs) {
    const seenInDoc = new Set();
    walk(doc, '', seenInDoc);
  }

  return fields;
}

function markdownEscape(v) {
  return String(v ?? '').replace(/\|/g, '\\|');
}

async function getSampleDocs(col, count) {
  if (count <= 0) return [];
  const size = Math.min(200, count);
  try {
    return await col.aggregate([{ $sample: { size } }]).toArray();
  } catch {
    return await col.find({}).limit(size).toArray();
  }
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI not found in server/.env');
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();

  const lines = [];
  lines.push('# MongoDB Schema Snapshot');
  lines.push('');
  lines.push(
    `Generated: ${new Date().toISOString()}  `
  );
  lines.push(`Database: \`${dbName}\``);
  lines.push('');
  lines.push(
    '_Note: This schema is inferred from sampled documents (up to 200 per collection), so optional/rare fields may vary._'
  );
  lines.push('');

  const sortedCollections = collections
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  for (const name of sortedCollections) {
    const col = db.collection(name);
    const count = await col.estimatedDocumentCount();
    const docs = await getSampleDocs(col, count);
    const schema = inferCollectionSchema(docs);
    const sortedFields = [...schema.keys()].sort((a, b) => a.localeCompare(b));

    lines.push(`## \`${name}\``);
    lines.push('');
    lines.push(`- Estimated documents: **${count}**`);
    lines.push(`- Sampled documents: **${docs.length}**`);
    lines.push('');

    if (sortedFields.length === 0) {
      lines.push('_No fields found (empty collection or inaccessible sample)._');
      lines.push('');
      continue;
    }

    lines.push('| Field | Types | Presence in sample |');
    lines.push('|---|---|---|');
    for (const field of sortedFields) {
      const stat = schema.get(field);
      const types = [...stat.types].sort().join(', ');
      const pct =
        docs.length > 0
          ? `${((stat.count / docs.length) * 100).toFixed(1)}%`
          : '0.0%';
      lines.push(
        `| \`${markdownEscape(field)}\` | ${markdownEscape(types)} | ${pct} |`
      );
    }
    lines.push('');
  }

  const outPath = path.join(__dirname, '..', '..', 'docs', 'mongodb-schema.md');
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  logger.log(`Schema written to ${outPath}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  logger.error(err?.message || String(err));
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});

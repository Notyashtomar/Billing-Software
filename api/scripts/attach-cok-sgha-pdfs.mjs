/**
 * Attach the signed Cochin PDFs in api/data/COK_SGHA to the matching COK contracts.
 * Usage (from api/): node scripts/attach-cok-sgha-pdfs.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const root = dirname(fileURLToPath(import.meta.url));
const uri = (readFileSync(join(root, '../.env'), 'utf8').match(/^MONGO_URI=(.*)$/m) || [])[1];
const folder = join(root, '../data/COK_SGHA');

const FILE_TO_CUSTOMER = [
  [/air asia berhad/i, 'AK'],
  [/^aix_/i, 'IX'],
  [/akasa/i, 'QP'],
  [/emirates/i, 'EK'],
  [/etihad/i, 'EY'],
  [/gulf/i, 'GF'],
  [/jazeera/i, 'J9'],
  [/kuwait/i, 'KU'],
  [/oman/i, 'WY'],
  [/thai air asia/i, 'FD'],
];

function customerFor(fileName) {
  for (const [pattern, code] of FILE_TO_CUSTOMER) {
    if (pattern.test(fileName)) return code;
  }
  return '';
}

const client = new MongoClient(uri);
await client.connect();
const billing = client.db('test').collection('billing');
const pdfs = client.db('test').collection('billing_contract_pdfs');

const files = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.pdf'));
let attached = 0;
for (const fileName of files) {
  const customerCode = customerFor(fileName);
  if (!customerCode) {
    console.log('SKIP unmatched', fileName);
    continue;
  }
  const contract = await billing.findOne(
    { docType: 'contract', stationCode: 'COK', customerCode },
    { projection: { contractNumber: 1, stationCode: 1 } },
  );
  if (!contract) {
    console.log('MISSING contract', customerCode, fileName);
    continue;
  }
  const data = readFileSync(join(folder, fileName));
  const uploadedAt = new Date();
  await pdfs.updateOne(
    { contractId: contract._id },
    {
      $set: {
        contractId: contract._id,
        stationCode: 'COK',
        contractNumber: contract.contractNumber,
        fileName,
        contentType: 'application/pdf',
        uploadedAt,
        data,
      },
    },
    { upsert: true },
  );
  await billing.updateOne(
    { _id: contract._id },
    {
      $set: {
        contractPdfFileName: fileName,
        contractPdfContentType: 'application/pdf',
        contractPdfUploadedAt: uploadedAt,
      },
      $unset: { contractPdfBase64: '' },
    },
  );
  attached += 1;
  console.log('attached', contract.contractNumber, fileName, data.length);
}

console.log('done', attached, 'of', files.length);
await client.close();

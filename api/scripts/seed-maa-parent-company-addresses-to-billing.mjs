/**
 * Copy Advance airline parent-company address onto MAA billing customers
 * and invoice drafts. Does not rename airlines/customers.
 *
 * From BWMS/apps/api:
 *   node scripts/seed-maa-parent-company-addresses-to-billing.mjs
 *   node scripts/seed-maa-parent-company-addresses-to-billing.mjs --dry-run
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const STATION = 'MAA';
const DRY_RUN = process.argv.includes('--dry-run');
const BILLING = 'billing';

function formatParentCompanyAddress(row) {
  const lines = [row?.address, row?.address2, row?.address3]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return lines.length ? lines.join('\n') : '';
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const airlines = mongoose.connection.collection('advance-airline');
  const billing = mongoose.connection.collection(BILLING);

  const summary = {
    stationCode: STATION,
    dryRun: DRY_RUN,
    airlinesWithAddress: 0,
    customersUpdated: 0,
    draftsUpdated: 0,
    invoicesFilledEmpty: 0,
    skippedNoCustomer: [],
  };

  try {
    const rows = await airlines
      .find({
        $or: [
          { stationCode: STATION },
          { stationCode: { $exists: false } },
          { stationCode: null },
          { stationCode: '' },
        ],
      })
      .project({
        code: 1,
        name: 1,
        address: 1,
        address2: 1,
        address3: 1,
        gstRegistrationNo: 1,
        stationCode: 1,
      })
      .toArray();

    for (const row of rows) {
      const code = String(row.code ?? '').trim().toUpperCase();
      const address = formatParentCompanyAddress(row);
      const gst = String(row.gstRegistrationNo ?? '').trim().toUpperCase();
      if (!code || (!address && !gst)) continue;
      summary.airlinesWithAddress += 1;

      const customer = await billing.findOne({
        docType: 'customer',
        stationCode: STATION,
        customerCode: code,
      });
      if (!customer) {
        summary.skippedNoCustomer.push(`${code} (${row.name ?? ''})`);
        continue;
      }

      const customerSet = {};
      if (address) customerSet.address = address;
      if (gst) customerSet.gstRegistrationNo = gst;
      if (!DRY_RUN && Object.keys(customerSet).length) {
        await billing.updateOne({ _id: customer._id }, { $set: customerSet });
      }
      summary.customersUpdated += 1;

      const draftFilter = {
        docType: 'invoice_header',
        stationCode: STATION,
        customerCode: code,
        status: 'draft',
      };
      if (address) {
        if (!DRY_RUN) {
          const draftRes = await billing.updateMany(draftFilter, {
            $set: { customerAddress: address },
          });
          summary.draftsUpdated += draftRes.modifiedCount;
        } else {
          summary.draftsUpdated += await billing.countDocuments(draftFilter);
        }

        const emptyPostedFilter = {
          docType: 'invoice_header',
          stationCode: STATION,
          customerCode: code,
          status: { $ne: 'draft' },
          $or: [
            { customerAddress: { $exists: false } },
            { customerAddress: null },
            { customerAddress: '' },
          ],
        };
        if (!DRY_RUN) {
          const postedRes = await billing.updateMany(emptyPostedFilter, {
            $set: { customerAddress: address },
          });
          summary.invoicesFilledEmpty += postedRes.modifiedCount;
        } else {
          summary.invoicesFilledEmpty += await billing.countDocuments(emptyPostedFilter);
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});

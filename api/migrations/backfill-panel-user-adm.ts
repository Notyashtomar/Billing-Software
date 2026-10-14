/**
 * One-time / idempotent backfill for panel-user admin IDs (100001, …).
 *
 * Usage (from the `server` directory):
 *   npx ts-node --project tsconfig.scripts.json migrations/backfill-panel-user-adm.ts --dry-run
 *   npx ts-node --project tsconfig.scripts.json migrations/backfill-panel-user-adm.ts --apply
 *
 * Requires `MONGO_URI` in `.env`.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import {
  formatPanelUserAdmNumber,
  normalizePanelUserAdmNumberValue,
  parsePanelUserAdmSeq,
  PANEL_USER_ADM_COUNTER_KEY,
  PANEL_USER_ADM_NUMBER_START,
} from '../src/user/utils/panel-user-adm.util';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('BackfillPanelUserAdm');
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function panelUserAdmEligibilityFilter() {
  return {
    accountStatus: { $ne: 'invited' },
    $or: [
      { createdViaPanel: true },
      {
        approvalStatus: 'approved',
        registrationStatus: 'approved',
      },
      {
        $and: [
          {
            $or: [
              { inviteCode: { $exists: false } },
              { inviteCode: null },
              { inviteCode: '' },
            ],
          },
        ],
      },
    ],
  };
}

function missingAdmNumberFilter() {
  return {
    $or: [{ admNumber: { $exists: false } }, { admNumber: null }, { admNumber: '' }],
  };
}

async function maxExistingAdmSeq(
  users: mongoose.mongo.Collection,
): Promise<number> {
  const rows = await users
    .find({ admNumber: { $exists: true, $nin: [null, ''] } }, { projection: { admNumber: 1 } })
    .toArray();
  let max = PANEL_USER_ADM_NUMBER_START - 1;
  for (const row of rows) {
    const seq = parsePanelUserAdmSeq(row.admNumber);
    if (seq != null) max = Math.max(max, seq);
  }
  return max;
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  const apply = hasFlag('apply');
  const dryRun = !apply;

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database connection');
    process.exit(1);
  }

  const users = db.collection('users');
  const counters = db.collection('panel_user_adm_counter');

  const legacy = await users.find({ admNumber: /^ADM-/i }).toArray();
  if (apply) {
    for (const user of legacy) {
      const normalized = normalizePanelUserAdmNumberValue(user.admNumber);
      if (!normalized) continue;
      await users.updateOne(
        { _id: user._id },
        { $set: { admNumber: normalized } },
      );
      logger.log(`  normalized ${user.admNumber} → ${normalized}`);
    }
  } else if (legacy.length > 0) {
    logger.log(`[dry-run] Would normalize ${legacy.length} legacy ADM- prefixed ID(s)`);
  }

  const missing = await users
    .find({
      ...panelUserAdmEligibilityFilter(),
      ...missingAdmNumberFilter(),
    })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  let seq = await maxExistingAdmSeq(users);
  const planned: Array<{ id: string; name: string; admNumber: string }> = [];

  for (const user of missing) {
    seq += 1;
    planned.push({
      id: String(user._id),
      name: String(user.name ?? ''),
      admNumber: formatPanelUserAdmNumber(seq),
    });
  }

  const counterSeq = planned.length > 0 ? seq : await maxExistingAdmSeq(users);

  logger.log(
    dryRun
      ? `[dry-run] Would assign ${planned.length} ADM number(s); counter → ${counterSeq}`
      : `Assigning ${planned.length} ADM number(s); counter → ${counterSeq}`,
  );

  for (const row of planned) {
    logger.log(`  ${row.admNumber} → ${row.name} (${row.id})`);
    if (apply) {
      await users.updateOne(
        { _id: new mongoose.Types.ObjectId(row.id) },
        { $set: { admNumber: row.admNumber, createdViaPanel: true } },
      );
    }
  }

  if (apply) {
    await counters.updateOne(
      { key: PANEL_USER_ADM_COUNTER_KEY },
      { $set: { key: PANEL_USER_ADM_COUNTER_KEY, seq: counterSeq } },
      { upsert: true },
    );
  }

  await mongoose.disconnect();
}

void main().catch((err) => {
  logger.error(err);
  process.exit(1);
});

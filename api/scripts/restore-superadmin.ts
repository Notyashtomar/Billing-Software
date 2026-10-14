/**
 * Restore the env-seeded super admin into the `admin` collection.
 *
 * The super admin (userid/email/password/role from `.env`) is normally seeded by
 * AdminBootstrapService on boot. If the document is deleted by mistake it cannot
 * be recreated by simply restarting, because the panel `createAdmin` path now
 * enforces a password policy + requires an explicit permission set. This script
 * recreates the account directly (bypassing the panel policy) with FULL access
 * to every FRIS tab/sub-page and the global-admin flag — i.e. the same role and
 * permissions a super admin is meant to have.
 *
 * Usage (from the `server` directory):
 *   # Create if missing (no-op if it already exists):
 *   npx ts-node --project tsconfig.scripts.json scripts/restore-superadmin.ts
 *
 *   # Recreate/overwrite an existing record (reset password + permissions):
 *   npx ts-node --project tsconfig.scripts.json scripts/restore-superadmin.ts --force
 *
 * Requires SUPERADMIN_* vars and MONGO_URI in `.env`.
 */

import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('RestoreSuperadmin');

/** Mirrors src/user/utils/permissions-to-flags.ts (kept inline to stay self-contained). */
const PERMISSION_SUB_PAGES: Record<string, string[]> = {
  dashboard: ['Dashboard page'],
  creation: ['Scheduled Airlines', 'Additional Flights', 'RAF'],
  advance: [
    'Gateway',
    'Scheduled Airlines',
    'Airline',
    'Aircraft',
    'Equipment',
    'Staff',
    'Airline Contact',
    'Logo of Airline',
    'Raf Airline',
    'Non Scheduled Airline',
    'Terminal',
    'Other Services',
    'DCS Master',
    'Aircraft Registration',
    'AMS Services',
    'Schedule Setup',
    'Schedule Equipment Setup',
    'Cargo',
    'Create New Cargo Airline',
    'Create New Scheduled',
    'Services',
    'Flight Creation',
    'Unit Master',
    'GH Representative',
    'Invoicing',
    'Scheduled Flight Data',
    'Cleaning Services',
    'Non Scheduled Flight Data',
    'MAAS Services',
    'RAF (Ramp Assistance Forms)',
    'Cancel Scheduled Flight Data',
    'Cancel Non Scheduled Flight Data',
    'Handling Status Report',
    'Alert Setup',
  ],
  flights: [
    'Scheduled Airlines',
    'Scheduled Data Export',
    'MIS Scheduled Flights',
    'Cancellation History',
    'Non-Scheduled Airlines',
    'Non scheduled Booking',
    'Booking Details',
    'Non-Scheduled Data',
    'MIS Non-Scheduled Flights',
    'Non-Scheduled Cancellation History',
    'Flight Schedule',
    'Peak Flights',
  ],
  reports: [
    'Pax Shift Report',
    'Pax Shift Analysis Report',
    'Ramp Shift Report',
    'GSD Shift Report',
    'Quality Report',
    'Missing FHR Report',
    'Delay Report',
    'Cleaning Services',
    'Consolidated Report',
    'Scheduled FHR Report',
    'Non Scheduled FHR Report',
  ],
  mis: [
    'MIS Station Wise',
    'MIS Airline Wise',
    'MIS Month Wise',
    'MIS Remarks',
    'MIS RAF',
    'MIS BHS',
    'MIS ADS',
  ],
  others: [
    'Download Attachments',
    'Exported Data Log Details',
    'Invoice Pending',
    'Exported Data Status',
    'Exported Error Report',
  ],
};

function buildFullPermissions(): {
  accessTabs: string[];
  accessSubPages: Record<string, string[]>;
} {
  const accessTabs = Object.keys(PERMISSION_SUB_PAGES);
  const accessSubPages: Record<string, string[]> = {};
  for (const tab of accessTabs) {
    accessSubPages[tab] = [...PERMISSION_SUB_PAGES[tab]];
  }
  return { accessTabs, accessSubPages };
}

function buildFlagsFromPermissions(
  accessSubPages: Record<string, string[]>,
): Record<string, Record<string, number>> {
  const flags: Record<string, Record<string, number>> = {};
  for (const [tabKey, allPages] of Object.entries(PERMISSION_SUB_PAGES)) {
    const selected = new Set(accessSubPages[tabKey] ?? []);
    const nested: Record<string, number> = {};
    for (const page of allPages) {
      nested[page] = selected.has(page) ? 1 : 0;
    }
    flags[tabKey] = nested;
  }
  return flags;
}

function reqEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) {
    logger.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  const name = reqEnv('SUPERADMIN_NAME');
  const userid = reqEnv('SUPERADMIN_USERNAME');
  const email = reqEnv('SUPERADMIN_EMAIL').toLowerCase();
  const rawPassword = reqEnv('SUPERADMIN_PASSWORD');
  const role = reqEnv('SUPERADMIN_ROLE');
  const isGlobalAdmin =
    String(process.env.SUPERADMIN_IS_GLOBAL ?? 'true')
      .trim()
      .toLowerCase() !== 'false';

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }
  const coll = db.collection('admin');

  const [byEmail, byUserid] = await Promise.all([
    coll.findOne({ email }),
    coll.findOne({ userid }),
  ]);

  if ((byEmail || byUserid) && !force) {
    logger.warn(
      `Super admin already exists (email=${email} found=${!!byEmail}, userid=${userid} found=${!!byUserid}). ` +
        `Nothing changed. Re-run with --force to reset password + permissions.`,
    );
    await mongoose.disconnect();
    return;
  }

  if (byUserid && byEmail && String(byUserid._id) !== String(byEmail._id)) {
    logger.error(
      `Conflict: userid "${userid}" and email "${email}" belong to different admin records. Resolve manually.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const { accessTabs, accessSubPages } = buildFullPermissions();
  const flags = buildFlagsFromPermissions(accessSubPages);
  const hashedPassword = await bcrypt.hash(rawPassword, 10);
  const now = new Date();

  const doc = {
    name,
    userid,
    email,
    role,
    password: hashedPassword,
    isGlobalAdmin,
    flags,
    permissions: { accessTabs, accessSubPages },
    tokenVersion: 0,
    updatedAt: now,
  };

  if (force && (byEmail || byUserid)) {
    const filter = byEmail ? { email } : { userid };
    await coll.updateOne(filter, { $set: doc });
    logger.log(
      `Super admin reset (email=${email}, userid=${userid}, role=${role}, isGlobalAdmin=${isGlobalAdmin}). ` +
        `Password + full permissions restored. Existing sessions should re-login.`,
    );
  } else {
    await coll.insertOne({ ...doc, createdAt: now });
    logger.log(
      `Super admin restored (email=${email}, userid=${userid}, role=${role}, isGlobalAdmin=${isGlobalAdmin}) ` +
        `with full access to all ${accessTabs.length} FRIS tabs.`,
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});

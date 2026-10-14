import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard: main merge #123 once stripped scheduled-daily providers while
 * RawFlightDataService still injected ScheduledDailyReadService → Nest bootstrap fail.
 * Static source check avoids pulling the full Mongoose graph into unit Jest.
 */
describe('RawFlightDataModule', () => {
  const modulePath = join(__dirname, 'raw-flight-data.module.ts');

  it('registers scheduled-daily providers required by RawFlightDataService', () => {
    const source = readFileSync(modulePath, 'utf8');
    for (const token of [
      'ScheduledDailyReadService',
      'ScheduledDailyProjectorService',
      'ScheduledDailyProjectionOutboxService',
      'ScheduledDailyRow.name',
      'ScheduledDailyProjectionOutbox.name',
    ]) {
      expect(source).toContain(token);
    }
    expect(source).toMatch(
      /providers:\s*\[[\s\S]*ScheduledDailyReadService[\s\S]*\]/,
    );
  });
});

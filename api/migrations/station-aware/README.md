# Multi-Station Migration

Reversible, **manually-run** scripts that retro-fit `stationCode` onto existing
data. Nothing here runs automatically.

All legacy data belongs to the original operating station: **`MAA`**.

## Order of operations (per release that converts new collections)

1. **Deploy the converted schemas/services** (they stamp/filter `stationCode`).
2. **Backfill** legacy documents:
   ```bash
   # from the server/ directory
   npm run migrate:station-backfill -- --dry-run      # preview counts
   npm run migrate:station-backfill -- --apply        # stamp stationCode=MAA
   ```
3. **Swap indexes** (legacy global-unique → station-scoped compound unique):
   ```bash
   npm run migrate:station-indexes -- --dry-run
   npm run migrate:station-indexes -- --apply
   ```
   > Always backfill **before** building unique compound indexes, or the build
   > fails on null `stationCode` values.

## Rollback

```bash
npm run migrate:station-indexes  -- --rollback   # restore legacy indexes
npm run migrate:station-backfill -- --rollback   # remove stationCode=MAA again
```

Both scripts accept `--collection=<name>` to scope to a single collection and
`--code=<CODE>` to use a station code other than `MAA`.

## Adding a collection

When a collection's schema is converted to use `stationAwarePlugin`, set its
entry in `station-collections.config.ts` to `status: 'live'` and declare any
`indexSwaps` (legacy unique index → compound). Only `live` entries are touched.

# Invoice draft status

Developer snapshot of Invoice drafts. Each path is `month/station/BHS|ADS/airline/status.txt`.

The month is the draft billing-period start. An airline is listed when an active contract at that station overlaps the month. `MISSING` means that contract has no invoice draft for the service in that month.

Posted invoices, binned drafts, cancelled drafts, RAF, and custom bills are not part of this tree.

Refresh from `api/` with `node scripts/export-invoice-draft-status.mjs`.

Last built for 2026-02 through 2026-10. 2147 airline folders, 288 with a draft, 1859 missing.

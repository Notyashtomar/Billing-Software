import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { join } from 'path';
import {
  FhrCollection,
  FhrCollectionDocument,
} from 'src/fhr-collection/schema/fhr-collection.schema';
import {
  FhrMainDetailsReseedSummary,
  mainDetailsFromExcelRow,
  mergeBlankMainDetailsFields,
  parseReseedSerial,
  readExcelSheetRows,
} from './fhr-main-details-reseed.util';

const DEFAULT_RELATIVE_PATH = join('data', 'updated_seeding_data_2.xlsx');
const DEFAULT_SHEET = 'CORRECTED VERSION';
const RESEED_REASON = 'fhr_main_details_excel_reseed';

@Injectable()
export class FhrMainDetailsReseedService {
  private readonly log = new Logger(FhrMainDetailsReseedService.name);

  constructor(
    @InjectModel(FhrCollection.name)
    private readonly fhrModel: Model<FhrCollectionDocument>,
  ) {}

  async reseedFromExcel(opts: {
    filePath?: string;
    sheetName?: string;
    dryRun?: boolean;
  } = {}): Promise<FhrMainDetailsReseedSummary> {
    const dryRun = !!opts.dryRun;
    const filePath = opts.filePath?.trim() || join(process.cwd(), DEFAULT_RELATIVE_PATH);
    const sheetName = opts.sheetName?.trim() || DEFAULT_SHEET;

    const summary: FhrMainDetailsReseedSummary = {
      dryRun,
      sheetName,
      filePath,
      totalRowsRead: 0,
      rowsSkippedInvalidSerial: 0,
      fhrDocsNotFound: 0,
      fhrDocsUpdated: 0,
      fhrDocsUnchanged: 0,
      fieldsFilled: 0,
      sampleUpdates: [],
      rowErrors: [],
    };

    const rows = readExcelSheetRows(filePath, sheetName);
    summary.totalRowsRead = rows.length;
    this.log.log(
      `Reading ${rows.length} rows from "${sheetName}" in ${filePath} (dryRun=${dryRun})`,
    );

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowIndex = idx + 2;
      try {
        const serial = parseReseedSerial(row.SerialNo ?? row['Serial No']);
        if (serial == null) {
          summary.rowsSkippedInvalidSerial += 1;
          continue;
        }

        const existing = await this.fhrModel
          .findOne({ SerialNo: serial })
          .select({ mainDetails: 1 })
          .lean()
          .exec();

        if (!existing) {
          summary.fhrDocsNotFound += 1;
          continue;
        }

        const incoming = mainDetailsFromExcelRow(row);
        const existingMain = existing.mainDetails as
          | Record<string, unknown>
          | null
          | undefined;
        const { merged, changedFields } = mergeBlankMainDetailsFields(
          existingMain,
          incoming,
          serial,
        );

        if (changedFields.length === 0) {
          summary.fhrDocsUnchanged += 1;
          continue;
        }

        summary.fhrDocsUpdated += 1;
        summary.fieldsFilled += changedFields.length;

        if (summary.sampleUpdates.length < 8) {
          summary.sampleUpdates.push({ serialNo: serial, fields: changedFields });
        }

        if (dryRun) continue;

        await this.fhrModel.updateOne(
          { SerialNo: serial },
          {
            $set: {
              mainDetails: merged,
              lastSnapshotAt: new Date(),
              lastSnapshotReason: RESEED_REASON,
            },
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary.rowErrors.push({ rowIndex, message });
        this.log.warn(`Row ${rowIndex} failed: ${message}`);
      }
    }

    this.log.log(
      `Reseed complete — updated=${summary.fhrDocsUpdated} unchanged=${summary.fhrDocsUnchanged} notFound=${summary.fhrDocsNotFound} fieldsFilled=${summary.fieldsFilled}`,
    );
    return summary;
  }
}

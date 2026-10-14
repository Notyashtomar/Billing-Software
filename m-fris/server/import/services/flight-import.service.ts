import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IMPORT_ERROR_TYPES,
  IMPORT_HISTORY_STATUS,
} from '../constants/flight-import.constants';
import type { FlightImportDto } from '../dto/flight-import.dto';
import {
  ImportHistory,
  ImportHistoryDocument,
} from '../schema/import-history.schema';
import { parseExcelBuffer } from '../utils/excel-parser.util';
import {
  ImportErrorCollector,
  type ImportValidationError,
} from '../utils/import-error-collector';
import { validateExcelFile } from '../validators/excel-file.validator';
import { validateFlightImportRow } from '../validators/flight-row.validator';
import { validateBusinessRules } from '../validators/business-rule.validator';
import { FlightImportMasterDataService } from './flight-import-master-data.service';
import { FlightImportDbValidationService } from './flight-import-db-validation.service';
import { FlightImportErrorExcelService } from './flight-import-error-excel.service';
import { FlightImportPersistenceService } from './flight-import-persistence.service';

export interface FlightImportResult {
  success: boolean;
  message: string;
  fileName: string;
  importId?: string;
  totalRows: number;
  validRows: number;
  importedRows: number;
  failedRows: number;
  errors: ImportValidationError[];
  errorFileUrl?: string;
  processingTimeMs: number;
}

@Injectable()
export class FlightImportService {
  private readonly logger = new Logger(FlightImportService.name);

  constructor(
    @InjectModel(ImportHistory.name)
    private readonly importHistoryModel: Model<ImportHistoryDocument>,
    private readonly masterDataService: FlightImportMasterDataService,
    private readonly dbValidationService: FlightImportDbValidationService,
    private readonly errorExcelService: FlightImportErrorExcelService,
    private readonly persistenceService: FlightImportPersistenceService,
  ) {}

  async importFromFile(
    file: Express.Multer.File,
    uploadedBy: string,
  ): Promise<FlightImportResult> {
    const started = Date.now();
    const fileName = String(file.originalname ?? 'flight-import.xlsx');

    this.logger.log(`Upload started: ${fileName} by ${uploadedBy || 'unknown'}`);

    const fileValidation = validateExcelFile(file);
    if (!fileValidation.valid) {
      throw new BadRequestException({
        success: false,
        message: fileValidation.message ?? 'Excel validation failed',
        type: IMPORT_ERROR_TYPES.FILE_VALIDATION_FAILED,
        errors: [],
      });
    }

    const importId = new Types.ObjectId().toHexString();
    const history = await this.importHistoryModel.create({
      _id: importId,
      filename: fileName,
      uploadedBy,
      uploadedAt: new Date(),
      status: IMPORT_HISTORY_STATUS.PROCESSING,
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
    });

    try {
      const parsed = parseExcelBuffer(file.buffer);
      if (!parsed.success || !parsed.sheet) {
        if (parsed.sheet?.headerValidation.error) {
          throw new BadRequestException({
            success: false,
            message: 'Excel validation failed',
            ...parsed.sheet.headerValidation.error,
            errors: [],
          });
        }
        throw new BadRequestException({
          success: false,
          message: parsed.message ?? 'Excel parsing failed',
          errors: [],
        });
      }

      const { rows } = parsed.sheet;
      const collector = new ImportErrorCollector();
      const fileDuplicateTracker = {
        flightDateKeys: new Set<string>(),
        serialNos: new Set<string>(),
      };
      const masters = await this.masterDataService.loadSnapshot();

      const rowCandidates: Array<{
        rowNumber: number;
        dto: FlightImportDto;
        raw: Record<string, string>;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2;
        const raw = rows[i];
        const rowResult = await validateFlightImportRow(rowNumber, raw);
        if (!rowResult.valid || !rowResult.dto) {
          collector.addMany(rowResult.errors);
          continue;
        }

        const businessErrors = validateBusinessRules(
          rowNumber,
          rowResult.dto,
          masters,
          fileDuplicateTracker,
        );
        if (businessErrors.length > 0) {
          collector.addMany(businessErrors);
          continue;
        }

        rowCandidates.push({
          rowNumber,
          dto: rowResult.dto,
          raw,
        });
      }

      const dbSnapshot = await this.dbValidationService.loadDuplicateSnapshot(rowCandidates);
      const validRows: Array<{ rowNumber: number; dto: FlightImportDto; raw: Record<string, string> }> = [];

      for (const candidate of rowCandidates) {
        const dbErrors = this.dbValidationService.validateAgainstDatabase(
          candidate.rowNumber,
          candidate.dto,
          dbSnapshot,
        );
        if (dbErrors.length > 0) {
          collector.addMany(dbErrors);
          continue;
        }
        validRows.push(candidate);
        dbSnapshot.flightDateKeys.add(
          `${candidate.dto.flightNo.toUpperCase()}|${candidate.dto.date}`,
        );
        dbSnapshot.serialNos.add(candidate.dto.serialNo);
      }

      this.logger.log(
        `Validation completed: total=${rows.length}, valid=${validRows.length}, failed=${collector.countFailedRows()}`,
      );

      let importedRows = 0;
      if (validRows.length > 0) {
        importedRows = await this.persistenceService.insertValidRows(validRows);
        this.logger.log(`Inserted rows: ${importedRows}`);
      }

      const failedRows = collector.countFailedRows();
      const processingTimeMs = Date.now() - started;

      let errorFileUrl: string | undefined;
      if (collector.hasErrors()) {
        const failedByRow = new Map<number, { raw: Record<string, string>; errors: ImportValidationError[] }>();
        for (const err of collector.getErrors()) {
          const existing = failedByRow.get(err.row);
          const raw = rows[err.row - 2] ?? {};
          if (existing) {
            existing.errors.push(err);
          } else {
            failedByRow.set(err.row, { raw, errors: [err] });
          }
        }
        errorFileUrl = await this.errorExcelService.generateImportErrorExcel(
          importId,
          [...failedByRow.entries()].map(([rowNumber, v]) => ({
            rowNumber,
            raw: v.raw,
            errors: v.errors,
          })),
        );
      }

      const status =
        importedRows === 0 && failedRows > 0
          ? IMPORT_HISTORY_STATUS.FAILED
          : failedRows > 0
            ? IMPORT_HISTORY_STATUS.PARTIAL
            : IMPORT_HISTORY_STATUS.COMPLETED;

      await this.importHistoryModel.updateOne(
        { _id: history._id },
        {
          $set: {
            totalRows: rows.length,
            importedRows,
            failedRows,
            status,
            errorFilePath: errorFileUrl ?? '',
            processingTimeMs,
          },
        },
      );

      this.logger.log(
        `Import finished in ${processingTimeMs}ms: imported=${importedRows}, failed=${failedRows}`,
      );

      return {
        success: importedRows > 0,
        message:
          importedRows > 0
            ? failedRows > 0
              ? 'Import completed with partial success'
              : 'Import completed successfully'
            : 'Excel validation failed',
        fileName,
        importId,
        totalRows: rows.length,
        validRows: validRows.length,
        importedRows,
        failedRows,
        errors: collector.getErrors(),
        errorFileUrl,
        processingTimeMs,
      };
    } catch (err) {
      await this.importHistoryModel.updateOne(
        { _id: history._id },
        {
          $set: {
            status: IMPORT_HISTORY_STATUS.FAILED,
            processingTimeMs: Date.now() - started,
          },
        },
      );
      throw err;
    }
  }

  async getImportStatus(importId: string) {
    const doc = await this.importHistoryModel.findById(importId).lean();
    if (!doc) return null;
    return {
      importId: String(doc._id),
      fileName: doc.filename,
      uploadedBy: doc.uploadedBy,
      uploadedAt: doc.uploadedAt,
      totalRows: doc.totalRows,
      importedRows: doc.importedRows,
      failedRows: doc.failedRows,
      status: doc.status,
      errorFileUrl: doc.errorFilePath || undefined,
      processingTimeMs: doc.processingTimeMs,
    };
  }

  getTemplateBuffer(): Promise<Buffer> {
    return this.errorExcelService.generateTemplateExcel();
  }
}

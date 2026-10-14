import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ImportConcurrencyInterceptor } from '../protection/interceptors/import-concurrency.interceptor';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../auth/enums/roles.enum';
import { MaaExcelImportService } from './maa-excel-import.service';

/**
 * Bulk import from MAA March-style workbook (Sheet1=data, Sheet2=mapping).
 * POST multipart form field `file` (.xlsx). Query: dryRun=true to validate only.
 */
@Roles(...ADMIN_ROLES)
@Controller('import')
export class MaaExcelImportController {
  constructor(private readonly maaExcelImportService: MaaExcelImportService) {}

  @Post('maa-march')
  @UseInterceptors(ImportConcurrencyInterceptor, FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }))
  async importMaaMarch(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('dryRun') dryRun?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Upload an .xlsx file as multipart field "file".',
      );
    }
    const isDry = dryRun === 'true' || dryRun === '1' || dryRun === 'yes';
    return this.maaExcelImportService.importFromBuffer(file.buffer, {
      dryRun: isDry,
    });
  }
}

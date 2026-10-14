import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { OPERATIONAL_ROLES } from '../../auth/enums/roles.enum';
import { ImportConcurrencyInterceptor } from '../../protection/interceptors/import-concurrency.interceptor';
import { MAX_EXCEL_FILE_BYTES } from '../constants/flight-import.constants';
import { validateExcelFile } from '../validators/excel-file.validator';
import { FlightImportService } from '../services/flight-import.service';

@Roles(...OPERATIONAL_ROLES)
@Controller('import/flights')
export class FlightImportController {
  constructor(private readonly flightImportService: FlightImportService) {}

  @Post('excel')
  @UseInterceptors(
    ImportConcurrencyInterceptor,
    FileInterceptor('file', { limits: { fileSize: MAX_EXCEL_FILE_BYTES } }),
  )
  async importExcel(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const fileValidation = validateExcelFile(file);
    if (!fileValidation.valid) {
      throw new BadRequestException({
        success: false,
        message: fileValidation.message ?? 'Excel validation failed',
        errors: [],
      });
    }

    return this.flightImportService.importFromFile(
      file as Express.Multer.File,
      String(user?.userId ?? user?.userid ?? '').trim(),
    );
  }

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.flightImportService.getTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="additional-flights-import-template.xlsx"',
    );
    res.send(buffer);
  }

  @Get(':importId/status')
  async getImportStatus(@Param('importId') importId: string) {
    const status = await this.flightImportService.getImportStatus(importId);
    if (!status) {
      throw new BadRequestException({
        success: false,
        message: 'Import record not found',
      });
    }
    return { success: true, ...status };
  }
}

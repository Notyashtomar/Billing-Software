import {
  Controller,
  Get,
  Post,
  Body,
  ConflictException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottleCategoryDecorator } from '../../../src/protection/decorators/throttle-category.decorator';
import { SkipTimeout } from '../../../src/protection/decorators/skip-timeout.decorator';
import { ImportConcurrencyInterceptor } from '../../../src/protection/interceptors/import-concurrency.interceptor';
import { ExportConcurrencyInterceptor } from '../../../src/protection/interceptors/export-concurrency.interceptor';
import { Observable, delay, of } from 'rxjs';

@Controller('auth')
export class SmokeAuthController {
  @ThrottleCategoryDecorator('AUTH')
  @Post('login')
  login(@Body() body: { userid?: string; password?: string }) {
    if (!body?.userid || body.password === 'wrong') {
      return { success: false, statusCode: 401 };
    }
    return { success: true, token: 'smoke-token-stub' };
  }

  @ThrottleCategoryDecorator('AUTH')
  @Post('admin-login')
  adminLogin() {
    return { success: true };
  }

  @ThrottleCategoryDecorator('AUTH')
  @Post('forgot-password')
  forgotPassword() {
    return { success: true };
  }

  @ThrottleCategoryDecorator('AUTH')
  @Post('reset-password')
  resetPassword() {
    return { success: true };
  }

  @Get('session')
  session() {
    return { success: true };
  }
}

@Controller('dashboard-summary')
export class SmokeDashboardController {
  @Get()
  bundles() {
    return { ok: true, type: 'bundles' };
  }

  @Get('latest')
  latest() {
    return { ok: true, type: 'latest' };
  }
}

@Controller('dashboard-kpi-flights')
export class SmokeKpiController {
  @Get()
  list() {
    return { ok: true, flights: [] };
  }
}

@Controller('reports')
export class SmokeReportsController {
  @Get('quality-scheduled-table')
  qualityTable() {
    return { ok: true, rows: [] };
  }

  @Get('delay-report-summary')
  delaySummary() {
    return { ok: true };
  }

  @Get('heavy-analytics')
  heavy() {
    return { ok: true, heavy: true };
  }
}

@Controller('exports')
export class SmokeExportsController {
  @Get('report')
  @UseInterceptors(ExportConcurrencyInterceptor)
  exportReport(): Observable<{ ok: boolean; exportId: string }> {
    return of({ ok: true, exportId: 'exp-1' }).pipe(delay(400));
  }

  @Get('slow-report')
  @SkipTimeout()
  slowReport(): Observable<{ ok: boolean }> {
    return of({ ok: true }).pipe(delay(250));
  }
}

@Controller('import')
export class SmokeImportController {
  @Post('maa-march')
  @UseInterceptors(
    ImportConcurrencyInterceptor,
    FileInterceptor('file', { limits: { fileSize: 1024 } }),
  )
  importFile(@UploadedFile() file?: Express.Multer.File): Observable<{ ok: boolean; bytes: number }> {
    if (!file?.buffer?.length) {
      throw new ConflictException('file required');
    }
    return of({ ok: true, bytes: file.size }).pipe(delay(400));
  }
}

@Controller('smoke')
export class SmokeUtilityController {
  @Get('slow')
  slow(): Observable<{ ok: boolean }> {
    return of({ ok: true }).pipe(delay(250));
  }

  @Get('slow-skip')
  @SkipTimeout()
  slowSkip(): Observable<{ ok: boolean }> {
    return of({ ok: true }).pipe(delay(250));
  }
}

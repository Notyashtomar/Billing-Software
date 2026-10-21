import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { BillingCustomersService } from '../services/billing-customers.service';
import {
  CurrentBillingActor,
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  CreateBillingCustomerDto,
  BulkDeleteBillingCustomersDto,
  ListBillingCustomersQueryDto,
  UpdateBillingCustomerDto,
} from '../dto/billing-customer.dto';

/**
 * BC Page: Customers
 * Audit: BC_SCREEN_INVENTORY.md §A1
 * FRIS: /billing/customers
 * API: GET/POST/PATCH /billing/customers
 * Collection: billing_customers
 */
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/customers')
export class BillingCustomersController {
  constructor(private readonly customersService: BillingCustomersService) {}

  @Get()
  list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListBillingCustomersQueryDto,
  ) {
    return this.customersService.list(station, query);
  }

  @Post('sync-from-advance')
  @SkipTimeout()
  syncFromAdvance(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.syncFromAdvanceAirline(station, actor);
  }

  @Post('bulk-delete')
  bulkRemove(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: BulkDeleteBillingCustomersDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.removeMany(station, dto.ids, actor);
  }

  @Post('delete-all')
  removeAll(
    @CurrentBillingStation() station: StationScopeContext,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.removeAll(station, actor);
  }

  @Get('annexure-file')
  async annexureFile(
    @CurrentBillingStation() station: StationScopeContext,
    @Query('customerCode') customerCode: string,
    @Query('category') category: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.customersService.readAnnexure(station, customerCode, category);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', file.contentDisposition);
    return new StreamableFile(Uint8Array.from(file.buffer));
  }

  @Get(':id')
  findOne(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
  ) {
    return this.customersService.findOne(station, id);
  }

  @Post()
  create(
    @CurrentBillingStation() station: StationScopeContext,
    @Body() dto: CreateBillingCustomerDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.create(station, dto, actor);
  }

  @Patch(':id')
  update(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Body() dto: UpdateBillingCustomerDto,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.update(station, id, dto, actor);
  }

  @Post(':id/annexure')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  uploadAnnexure(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.saveAnnexure(station, id, category, file, actor);
  }

  @Delete(':id/annexure')
  removeAnnexure(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @Query('category') category: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.removeAnnexure(station, id, category, actor);
  }

  @Delete(':id')
  remove(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('id') id: string,
    @CurrentBillingActor() actor: { userId: string; userName: string },
  ) {
    return this.customersService.remove(station, id, actor);
  }
}


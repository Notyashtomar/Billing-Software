import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { REPORT_VIEW_ROLES } from '../../auth/enums/roles.enum';
import { ShippedBagsService } from '../services/shipped-bags.service';
import { UpsertShippedBagsDto } from '../dto/upsert-shipped-bags.dto';
import { QueryShippedBagsDto } from '../dto/query-shipped-bags.dto';

const upsertPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

const queryPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

@Roles(...REPORT_VIEW_ROLES)
@FrisPagePermission('reports', 'Pax Shift Report')
@Controller('pax-shift/shipped-bags')
export class ShippedBagsController {
  constructor(private readonly shippedBagsService: ShippedBagsService) {}

  /** Full collection for the Short shipped bag report landing state. */
  @Get('all')
  findAll() {
    return this.shippedBagsService.findAll();
  }

  /** Batch read for report tables (one round trip). */
  @Post('query')
  queryByFlightSerials(@Body(queryPipe) dto: QueryShippedBagsDto) {
    const list = Array.isArray(dto.flightSerials) ? dto.flightSerials : [];
    return this.shippedBagsService.getByFlightSerials(list);
  }

  @Get()
  getByFlightSerial(@Query('flightSerial') flightSerial?: string) {
    const fs = flightSerial?.trim();
    if (!fs) {
      throw new BadRequestException(
        'Query parameter flightSerial is required.',
      );
    }
    return this.shippedBagsService.getByFlightSerial(fs);
  }

  @Put()
  upsert(@Body(upsertPipe) dto: UpsertShippedBagsDto) {
    return this.shippedBagsService.upsert({
      flightSerial: dto.flightSerial,
      noOfBags: dto.noOfBags ?? '',
      rows: dto.rows ?? [],
    });
  }
}

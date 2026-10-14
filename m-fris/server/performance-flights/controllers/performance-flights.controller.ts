import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { SavePerformanceFlightsDto } from '../dto/save-performance-flights.dto';
import { PerformanceFlightsService } from '../services/performance-flights.service';

const saveBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

@Controller('performance-flights')
export class PerformanceFlightsController {
  constructor(
    private readonly performanceFlightsService: PerformanceFlightsService,
  ) {}

  /**
   * Save or replace all legs for a report key (Bird dashboard / performance JSON `performanceFlights` shape).
   * POST /performance-flights
   * Body: { "reportKey": "bird-flight-delhi-jan-march-2026", "title": "…", "flights": [ { "sta", "ata", "std", "atd" }, … ] }
   */
  @Post()
  @Roles(...ADMIN_ROLES)
  @UsePipes(saveBodyPipe)
  save(@Body() body: SavePerformanceFlightsDto) {
    return this.performanceFlightsService.save(body);
  }

  @Get()
  list() {
    return this.performanceFlightsService.listSummaries();
  }

  @Get(':reportKey')
  getOne(@Param('reportKey') reportKey: string) {
    return this.performanceFlightsService.getByKey(reportKey);
  }

  @Delete(':reportKey')
  @Roles(...ADMIN_ROLES)
  remove(@Param('reportKey') reportKey: string) {
    return this.performanceFlightsService.deleteByKey(reportKey);
  }
}

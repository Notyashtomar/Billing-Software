import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  BillingAircraftMasterService,
  type AircraftMasterWrite,
} from '../services/billing-aircraft-master.service';

@BillingPageAccess()
@Controller('billing/aircraft-master')
export class BillingAircraftMasterController {
  constructor(private readonly aircraftMaster: BillingAircraftMasterService) {}

  @Get()
  list() {
    return this.aircraftMaster.list();
  }

  @Post('import')
  importRows(@Body() body: { rows?: AircraftMasterWrite[] }) {
    return this.aircraftMaster.importRows(body?.rows ?? []);
  }

  @Post()
  create(@Body() body: AircraftMasterWrite) {
    return this.aircraftMaster.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: AircraftMasterWrite) {
    return this.aircraftMaster.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aircraftMaster.remove(id);
  }
}

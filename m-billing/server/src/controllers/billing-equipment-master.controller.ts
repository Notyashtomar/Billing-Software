import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  BillingEquipmentMasterService,
  type EquipmentMasterWrite,
} from '../services/billing-equipment-master.service';

@BillingPageAccess()
@Controller('billing/equipment-master')
export class BillingEquipmentMasterController {
  constructor(private readonly equipmentMaster: BillingEquipmentMasterService) {}

  @Get()
  list() {
    return this.equipmentMaster.list();
  }

  @Post('import')
  importRows(@Body() body: { rows?: EquipmentMasterWrite[] }) {
    return this.equipmentMaster.importRows(body?.rows ?? []);
  }

  @Post()
  create(@Body() body: EquipmentMasterWrite) {
    return this.equipmentMaster.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: EquipmentMasterWrite) {
    return this.equipmentMaster.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.equipmentMaster.remove(id);
  }
}

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

  @Post('replace-uom')
  replaceUom(@Body() body: { fromUom?: string; toUom?: string }) {
    return this.equipmentMaster.replaceUom(body?.fromUom ?? '', body?.toUom ?? '');
  }

  @Post('replace')
  replace(
    @Body() body: { column?: string; fromValue?: string; toValue?: string },
  ) {
    return this.equipmentMaster.replaceColumn(
      body?.column ?? '',
      body?.fromValue ?? '',
      body?.toValue ?? '',
    );
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

// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Patch,
//   Delete,
// } from '@nestjs/common';
// import { EquipmentManpowerService } from '../services/equipment-manpower.service';
// import { CreateEquipmentManpowerDto } from '../dto/create-equipment-manpower.dto';

// @Controller('equipment-manpower')
// export class EquipmentManpowerController {
//   constructor(
//     private readonly equipmentManpowerService: EquipmentManpowerService,
//   ) {}

//   @Post()
//   create(@Body() body: CreateEquipmentManpowerDto) {
//     return this.equipmentManpowerService.create(body);
//   }

//   @Get()
//   findAll() {
//     return this.equipmentManpowerService.findAll();
//   }

//   @Get('by-serial/:serialNo')
//   findBySerial(@Param('serialNo') serialNo: string) {
//     return this.equipmentManpowerService.findBySerialNo(Number(serialNo));
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.equipmentManpowerService.findOne(id);
//   }

//   @Patch(':id')
//   update(
//     @Param('id') id: string,
//     @Body() body: Partial<CreateEquipmentManpowerDto>,
//   ) {
//     return this.equipmentManpowerService.update(id, body);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.equipmentManpowerService.remove(id);
//   }
// }

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { EQUIPMENT_MANPOWER_CATALOG_SERIAL } from '../schema/equipment-manpower.schema';
import type { EquipmentManpowerCatalogItem } from '../schema/equipment-manpower-catalog-item.schema';
import { EquipmentManpowerService } from '../services/equipment-manpower.service';
import { CreateEquipmentManpowerDto } from '../dto/create-equipment-manpower.dto';
import { AdminPatchEquipmentManpowerDto } from '../dto/admin-patch-equipment-manpower.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';
import { FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import { FLIGHT_FORM_PAGE_PERMISSIONS } from '../../auth/decorators/flight-form-page-permissions';

// Access gated by FRIS page permissions (Scheduled / Non-Scheduled Airlines).
@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/equipment-manpower-details')
export class EquipmentManpowerController {
  constructor(
    private readonly equipmentManpowerService: EquipmentManpowerService,
  ) {}

  private validateSerial(serialNo: string): number {
    const serial = Number(serialNo);
    if (!serialNo || Number.isNaN(serial)) {
      throw new BadRequestException('Invalid flight serial number');
    }
    if (serial === EQUIPMENT_MANPOWER_CATALOG_SERIAL) {
      throw new BadRequestException(
        'This serial is reserved for the equipment/manpower master catalog',
      );
    }
    return serial;
  }

  /** Shared master catalog (`abbr`, `description`, `unit_type`) for GSE name resolution. */
  @Get('master-catalog')
  masterCatalog(@CurrentStation() station: StationScopeContext) {
    return this.equipmentManpowerService.getMasterCatalog(station);
  }

  /**
   * Dashboard (Equipment utilization card): raw list of every `equipment_name` from
   * `fhr_collection.equipmentDetails`. The dashboard pairs this with `master-catalog`
   * and classifies each line into M / NM / T client-side.
   */
  @Get('dashboard/equipment-line-names')
  async dashboardEquipmentLineNames() {
    const names =
      await this.equipmentManpowerService.getAllEquipmentLineNames();
    return { names };
  }

  /**
   * Dashboard: per-slot equipment utilization for flights whose STA falls in `from`–`to` (YYYY-MM-DD inclusive).
   * Slab from **from_time** only; categories from master catalog. Includes per-slot motorised equipment counts.
   */
  @Get('dashboard/equipment-util-slots')
  dashboardEquipmentUtilSlots(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('mode') mode?: string,
  ) {
    const f = (from ?? '').trim();
    const t = (to ?? '').trim();
    if (!f || !t) {
      throw new BadRequestException(
        'Query params "from" and "to" (YYYY-MM-DD) are required',
      );
    }
    const normalizedMode: '4h' | '6h' =
      (mode ?? '').trim().toLowerCase() === '4h' ? '4h' : '6h';
    return this.equipmentManpowerService.aggregateDashboardEquipmentUtilSlots(
      f,
      t,
      normalizedMode,
    );
  }

  /** Advance Gateway: list all `equipmentManpower` documents. */
  @Get('admin/documents')
  adminListDocuments(@CurrentStation() station: StationScopeContext) {
    return this.equipmentManpowerService.findAllLeanAdmin(station);
  }

  /**
   * Advance Gateway: create-or-replace the equipment/manpower master catalog
   * directly from the frontend. No seed step required — the page feeds the full
   * `catalogItems` array and this upserts the (station-scoped) master doc.
   */
  @Post('admin/catalog')
  adminUpsertCatalog(
    @Body() body: AdminPatchEquipmentManpowerDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const items = (body.catalogItems ?? []) as EquipmentManpowerCatalogItem[];
    return this.equipmentManpowerService.replaceMasterCatalog(items, station);
  }

  /** Advance Gateway: patch document by Mongo `_id`. */
  @Patch('admin/documents/:id')
  adminPatchDocument(
    @Param('id') id: string,
    @Body() body: AdminPatchEquipmentManpowerDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.equipmentManpowerService.adminPatchById(id, body, station);
  }

  /**
   * Scheduled airlines: equipment templates from Advance → Schedule Equipment setup.
   * Computes From/To from ATA/ATD (or STA/STD fallbacks) and option 1 / option 2 offsets.
   */
  @Get('scheduled-airline-equipment')
  scheduledAirlineEquipment(
    @Query('airlineCode') airlineCode: string | undefined,
    @Query('airlineName') airlineName: string | undefined,
    @Query('aircraftBody') aircraftBody: string | undefined,
    @Query('splitOperation') splitOperation: string | undefined,
    @Query('ataDate') ataDate: string | undefined,
    @Query('ataTime') ataTime: string | undefined,
    @Query('atdDate') atdDate: string | undefined,
    @Query('atdTime') atdTime: string | undefined,
    @Query('defaultDate') defaultDate: string | undefined,
    @CurrentStation() station: StationScopeContext,
  ) {
    const code = (airlineCode ?? '').trim();
    const name = (airlineName ?? '').trim();
    if (!code && !name) {
      throw new BadRequestException(
        'Query param airlineCode or airlineName is required',
      );
    }
    return this.equipmentManpowerService.getScheduledAirlineEquipmentTemplates(
      {
        airlineCode: code || undefined,
        airlineName: name || undefined,
        aircraftBody: (aircraftBody ?? 'NB').trim(),
        splitOperation: splitOperation === 'true',
        milestones: {
          ataDate: (ataDate ?? '').trim(),
          ataTime: (ataTime ?? '').trim(),
          atdDate: (atdDate ?? '').trim(),
          atdTime: (atdTime ?? '').trim(),
        },
        defaultDate: (defaultDate ?? '').trim(),
      },
      station,
    );
  }

  @Get(':serialNo')
  find(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.equipmentManpowerService.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateEquipmentManpowerDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.equipmentManpowerService.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateEquipmentManpowerDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.equipmentManpowerService.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.equipmentManpowerService.deleteBySerial(serial, station);
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BillingRafAdhocRate,
  BillingRafAdhocRateDocument,
} from '../schemas/billing.schemas';
import {
  StationScope,
  successResponse,
  type StationScopeContext,
} from '../common/station-scope';
import {
  CreateBillingRafAdhocRateDto,
  UpdateBillingRafAdhocRateDto,
} from '../dto/billing-raf-adhoc.dto';

function isSharedRafStation(code: string): boolean {
  const station = code.trim().toUpperCase();
  return station === '*' || station === 'ALL';
}

function rafRateKey(row: {
  itemKind?: string;
  label?: string;
  validFrom?: Date | string;
  validTo?: Date | string;
}): string {
  const from = row.validFrom instanceof Date ? row.validFrom.toISOString() : String(row.validFrom ?? '');
  const to = row.validTo instanceof Date ? row.validTo.toISOString() : String(row.validTo ?? '');
  return `${String(row.itemKind ?? '').trim().toLowerCase()}|${String(row.label ?? '').trim().toUpperCase()}|${from}|${to}`;
}

@Injectable()
export class BillingRafAdhocRatesService {
  constructor(
    @InjectModel(BillingRafAdhocRate.name)
    private readonly model: Model<BillingRafAdhocRateDocument>,
  ) {}

  /**
   * This station's saved rates, plus shared `*` templates this station has not
   * overridden. Editing a template copies it onto the station; it does not
   * change any other station.
   */
  async list(ctx: StationScopeContext) {
    const stationCode = StationScope.require(ctx);
    const items = await this.model
      .find({ stationCode: { $in: [stationCode, '*', 'ALL'] } })
      .sort({ itemKind: 1, label: 1, validFrom: 1 })
      .lean();
    const owned = new Set(
      items.filter((row) => !isSharedRafStation(String(row.stationCode ?? ''))).map(rafRateKey),
    );
    const visible = items.filter(
      (row) => !isSharedRafStation(String(row.stationCode ?? '')) || !owned.has(rafRateKey(row)),
    );
    return successResponse({ items: visible, total: visible.length });
  }

  async create(ctx: StationScopeContext, dto: CreateBillingRafAdhocRateDto) {
    const stationCode = StationScope.require(ctx);
    const doc = await this.model.create({
      itemKind: dto.itemKind,
      label: dto.label.trim(),
      remarks: dto.remarks?.trim() || undefined,
      uom: dto.uom.trim(),
      unitPriceINR: dto.unitPriceINR,
      unitPriceUSD: dto.unitPriceUSD,
      percentValue: dto.percentValue,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
      stationCode,
    });
    return successResponse({ items: [doc], total: 1 });
  }

  async update(ctx: StationScopeContext, id: string, dto: UpdateBillingRafAdhocRateDto) {
    const stationCode = StationScope.require(ctx);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('RAF adhoc rate not found');
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('RAF adhoc rate not found');

    const docStation = String(existing.stationCode ?? '').trim().toUpperCase();
    if (docStation !== stationCode) {
      const forked = await this.model.create({
        itemKind: dto.itemKind ?? existing.itemKind,
        label: dto.label != null ? dto.label.trim() : existing.label,
        remarks:
          dto.remarks !== undefined ? dto.remarks.trim() || undefined : existing.remarks,
        uom: dto.uom != null ? dto.uom.trim() : existing.uom,
        unitPriceINR: dto.unitPriceINR !== undefined ? dto.unitPriceINR : existing.unitPriceINR,
        unitPriceUSD: dto.unitPriceUSD !== undefined ? dto.unitPriceUSD : existing.unitPriceUSD,
        percentValue: dto.percentValue !== undefined ? dto.percentValue : existing.percentValue,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : existing.validFrom,
        validTo: dto.validTo ? new Date(dto.validTo) : existing.validTo,
        stationCode,
      });
      return successResponse(forked);
    }

    this.applyRatePatch(existing, dto);
    await existing.save();
    return successResponse(existing);
  }

  async remove(ctx: StationScopeContext, id: string) {
    const stationCode = StationScope.require(ctx);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('RAF adhoc rate not found');
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('RAF adhoc rate not found');
    const docStation = String(existing.stationCode ?? '').trim().toUpperCase();
    if (docStation !== stationCode) {
      throw new ForbiddenException('This rate belongs to a different station.');
    }
    await existing.deleteOne();
    return successResponse({ deleted: true });
  }

  private applyRatePatch(
    existing: BillingRafAdhocRateDocument,
    dto: UpdateBillingRafAdhocRateDto,
  ) {
    if (dto.itemKind) existing.itemKind = dto.itemKind;
    if (dto.label != null) existing.label = dto.label.trim();
    if (dto.remarks !== undefined) existing.remarks = dto.remarks.trim() || undefined;
    if (dto.uom != null) existing.uom = dto.uom.trim();
    if (dto.unitPriceINR !== undefined) existing.unitPriceINR = dto.unitPriceINR;
    if (dto.unitPriceUSD !== undefined) existing.unitPriceUSD = dto.unitPriceUSD;
    if (dto.percentValue !== undefined) existing.percentValue = dto.percentValue;
    if (dto.validFrom) existing.validFrom = new Date(dto.validFrom);
    if (dto.validTo) existing.validTo = new Date(dto.validTo);
  }
}

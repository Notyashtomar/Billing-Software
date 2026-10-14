import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingServiceCatalog,
  BillingServiceCatalogDocument,
  BillingRateCard,
  BillingRateCardDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  successResponse,
} from '../common/station-scope';
import {
  CreateServiceCatalogDto,
  ListServiceCatalogQueryDto,
  UpdateServiceCatalogDto,
} from '../dto/billing-service-catalog.dto';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';

@Injectable()
export class BillingServiceCatalogService {
  constructor(
    @InjectModel(BillingServiceCatalog.name)
    private readonly catalogModel: Model<BillingServiceCatalogDocument>,
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext, query: ListServiceCatalogQueryDto) {
    const filter: Record<string, unknown> = StationScope.filter({}, ctx);
    if (query.category) filter.category = query.category;
    if (query.active === 'true') filter.active = true;
    if (query.active === 'false') filter.active = false;
    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { serviceCode: new RegExp(term, 'i') },
        { description: new RegExp(term, 'i') },
      ];
    }

    const items = await this.catalogModel.find(filter).sort({ serviceCode: 1 }).lean();
    return successResponse({ items, total: items.length });
  }

  async findOne(ctx: StationScopeContext, serviceCode: string) {
    const doc = await this.catalogModel
      .findOne(StationScope.filter({ serviceCode }, ctx))
      .lean();
    if (!doc) throw new NotFoundException('Service code not found');
    return successResponse(doc);
  }

  async create(ctx: StationScopeContext, dto: CreateServiceCatalogDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const exists = await this.catalogModel.exists(
      StationScope.filter({ serviceCode: dto.serviceCode }, ctx),
    );
    if (exists) {
      throw new ConflictException(`Service code ${dto.serviceCode} already exists at this station`);
    }

    const created = await this.catalogModel.create(
      StationScope.stampCreate(
        {
          ...dto,
          lineType: 'service',
          royaltyApplicable: dto.royaltyApplicable ?? false,
          active: true,
        },
        ctx,
      ),
    );

    await this.auditEngine.log({
      entityType: 'service_catalog',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    return successResponse(created.toObject());
  }

  async update(
    ctx: StationScopeContext,
    serviceCode: string,
    dto: UpdateServiceCatalogDto,
    actor: BillingActor,
  ) {
    const doc = await this.catalogModel.findOne(StationScope.filter({ serviceCode }, ctx));
    if (!doc) throw new NotFoundException('Service code not found');
    StationScope.assertOwnership(doc, ctx);
    const fields = { ...dto } as UpdateServiceCatalogDto & { stationCode?: string };
    delete fields.stationCode;
    Object.assign(doc, fields);
    await doc.save();

    await this.auditEngine.log({
      entityType: 'service_catalog',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: dto as Record<string, unknown>,
    });

    return successResponse(doc.toObject());
  }

  async remove(ctx: StationScopeContext, serviceCode: string, actor: BillingActor) {
    const doc = await this.catalogModel.findOne(StationScope.filter({ serviceCode }, ctx));
    if (!doc) throw new NotFoundException('Service code not found');
    StationScope.assertOwnership(doc, ctx);

    const rateCardCount = await this.rateCardModel.countDocuments(
      StationScope.filter({ serviceCode: doc.serviceCode }, ctx),
    );
    if (rateCardCount > 0) {
      throw new ConflictException(
        `Cannot delete "${doc.serviceCode}": remove linked rate cards first`,
      );
    }

    const snapshot = doc.toObject();
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'service_catalog',
      entityId: snapshot._id,
      action: 'cancelled',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: snapshot.stationCode,
      changes: { deleted: true, serviceCatalog: snapshot },
    });

    return successResponse({ deleted: true });
  }

  async removeMany(ctx: StationScopeContext, serviceCodes: string[], actor: BillingActor) {
    const uniqueCodes = [...new Set(serviceCodes.map((c) => c.trim()).filter(Boolean))];
    let deleted = 0;
    const failed: Array<{ serviceCode: string; message: string }> = [];

    for (const serviceCode of uniqueCodes) {
      try {
        await this.remove(ctx, serviceCode, actor);
        deleted += 1;
      } catch (err) {
        failed.push({
          serviceCode,
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }

    return successResponse({ deleted, failed, requested: uniqueCodes.length });
  }

  async removeAll(ctx: StationScopeContext, actor: BillingActor) {
    const items = await this.catalogModel
      .find(StationScope.filter({}, ctx))
      .select('serviceCode')
      .lean();
    const serviceCodes = items.map((item) => item.serviceCode);
    return this.removeMany(ctx, serviceCodes, actor);
  }

  async listUoms(ctx: StationScopeContext) {
    const uoms = await this.catalogModel.distinct('uom', StationScope.filter({}, ctx));
    return successResponse({ uoms: uoms.sort() });
  }
}

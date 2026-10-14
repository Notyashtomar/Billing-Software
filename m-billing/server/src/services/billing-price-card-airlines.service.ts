import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BillingContract,
  BillingContractDocument,
  BillingCustomer,
  BillingCustomerDocument,
  BillingPriceCardAirline,
  BillingPriceCardAirlineDocument,
} from '../schemas/billing.schemas';
import {
  StationScope,
  successResponse,
  type StationScopeContext,
} from '../common/station-scope';
import {
  BulkCreateBillingPriceCardAirlinesDto,
  ListBillingPriceCardAirlinesQueryDto,
  UpdateBillingPriceCardAirlineDto,
} from '../dto/billing-price-card-airline.dto';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import { mergeHandlingTypes } from '../shared/price-card-handling';
import { resolveBillingCurrency, type BillingCurrency } from '../utils/billing-currency.util';
import {
  isDelhiStation,
  planDelhiInternationalCategoryUpdates,
} from '../utils/delhi-international-price-card';

type TwinKey = {
  customerCode: string;
  aircraftType: string;
  category: string;
  validFrom: Date;
  validTo: Date;
};

@Injectable()
export class BillingPriceCardAirlinesService {
  /** Stations that already ran a bulk ADS twin backfill in this process. */
  private readonly adsTwinBackfilledStations = new Set<string>();
  /** Stations whose blank BHS package currencies were aligned to the customer. */
  private readonly currencyBackfilledStations = new Set<string>();
  /** Delhi stations whose International-only airlines were saved as International. */
  private readonly intlCategoryAlignedStations = new Set<string>();

  constructor(
    @InjectModel(BillingPriceCardAirline.name)
    private readonly entryModel: Model<BillingPriceCardAirlineDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext, query: ListBillingPriceCardAirlinesQueryDto) {
    const stationCode = StationScope.require(ctx);

    // ADS twins are created on BHS write paths. Do NOT sync on every list —
    // that was N+1 Mongo work and made BHS/ADS rate-card screens crawl.
    // One cheap bulk backfill per station per process covers legacy gaps.
    if (!this.adsTwinBackfilledStations.has(stationCode)) {
      await this.syncAdsTwinsFromBhs(ctx);
      this.adsTwinBackfilledStations.add(stationCode);
    }
    if (!this.currencyBackfilledStations.has(stationCode)) {
      await this.backfillMissingBhsCurrency(ctx);
      this.currencyBackfilledStations.add(stationCode);
    }
    if (!this.intlCategoryAlignedStations.has(stationCode)) {
      await this.alignDelhiInternationalOnlyCategories(ctx);
      this.intlCategoryAlignedStations.add(stationCode);
    }

    const filter = StationScope.filter({ active: true }, ctx);
    if (query.handlingType) filter.handlingType = query.handlingType;
    if (query.customerCode?.trim()) {
      filter.customerCode = query.customerCode.trim().toUpperCase();
    }

    const items = await this.entryModel
      .find(filter)
      .sort({ airlineName: 1, aircraftType: 1 })
      .lean();

    return successResponse({ items, total: items.length });
  }

  /**
   * Delhi airlines whose contract category is International-only: save every
   * active price-card row as International. Other stations and Dom/Both
   * contracts are left unchanged.
   */
  async alignDelhiInternationalOnlyCategories(
    ctx: StationScopeContext,
  ): Promise<{ updated: number; retired: number }> {
    const stationCode = StationScope.require(ctx);
    if (!isDelhiStation(stationCode)) return { updated: 0, retired: 0 };

    const contracts = await this.contractModel
      .find(StationScope.filter({ category: 'Int', status: 'active' }, ctx))
      .select('customerCode')
      .lean();
    const customerCodes = [
      ...new Set(
        contracts
          .map((row) => String(row.customerCode ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (customerCodes.length === 0) return { updated: 0, retired: 0 };

    const rows = await this.entryModel
      .find(
        StationScope.filter(
          { active: true, customerCode: { $in: customerCodes } },
          ctx,
        ),
      )
      .select('handlingType customerCode aircraftType category')
      .lean();

    const plan = planDelhiInternationalCategoryUpdates(
      rows.map((row) => ({
        id: String(row._id),
        handlingType: String(row.handlingType ?? ''),
        customerCode: String(row.customerCode ?? ''),
        aircraftType: String(row.aircraftType ?? ''),
        category: String(row.category ?? ''),
      })),
    );

    if (plan.updateIds.length > 0) {
      await this.entryModel.updateMany(
        { _id: { $in: plan.updateIds.map((id) => new Types.ObjectId(id)) } },
        { $set: { category: 'Int' } },
      );
    }
    if (plan.retireIds.length > 0) {
      await this.entryModel.updateMany(
        { _id: { $in: plan.retireIds.map((id) => new Types.ObjectId(id)) } },
        { $set: { active: false } },
      );
    }

    return { updated: plan.updateIds.length, retired: plan.retireIds.length };
  }

  /**
   * Create/reactivate missing ADS twins for every active BHS price-card airline row.
   * Bulk: 2 reads + bulkWrite — not one find per BHS row.
   */
  async syncAdsTwinsFromBhs(
    ctx: StationScopeContext,
  ): Promise<{ created: number; reactivated: number }> {
    const stationCode = StationScope.require(ctx);
    const [bhsRows, adsRows] = await Promise.all([
      this.entryModel
        .find(StationScope.filter({ handlingType: 'BHS', active: true }, ctx))
        .lean(),
      this.entryModel
        .find(StationScope.filter({ handlingType: 'ADS' }, ctx))
        .lean(),
    ]);

    const adsByKey = new Map<string, (typeof adsRows)[number]>();
    for (const ads of adsRows) {
      adsByKey.set(this.twinLookupKey(ads), ads);
    }

    const toInsert: Array<Record<string, unknown>> = [];
    const toReactivateIds: Types.ObjectId[] = [];
    const customerCodes = new Set<string>();

    for (const bhs of bhsRows) {
      const key = this.twinLookupKey(bhs);
      customerCodes.add(String(bhs.customerCode ?? '').trim().toUpperCase());
      const existing = adsByKey.get(key);
      if (!existing) {
        toInsert.push(
          StationScope.stampCreate(
            {
              handlingType: 'ADS',
              customerCode: String(bhs.customerCode ?? '').trim().toUpperCase(),
              airlineName: String(bhs.airlineName ?? '').trim() || String(bhs.customerCode ?? ''),
              aircraftType: String(bhs.aircraftType ?? '').trim().toUpperCase(),
              category: String(bhs.category ?? '').trim(),
              validFrom: bhs.validFrom,
              validTo: bhs.validTo,
              remarks: bhs.remarks?.trim() || undefined,
              active: true,
            },
            ctx,
          ),
        );
        continue;
      }
      if (!existing.active) {
        toReactivateIds.push(existing._id as Types.ObjectId);
      }
    }

    let created = 0;
    let reactivated = 0;

    if (toInsert.length > 0) {
      await this.entryModel.insertMany(toInsert, { ordered: false });
      created = toInsert.length;
    }

    if (toReactivateIds.length > 0) {
      const result = await this.entryModel.updateMany(
        { _id: { $in: toReactivateIds } },
        { $set: { active: true } },
      );
      reactivated = result.modifiedCount ?? toReactivateIds.length;
    }

    await Promise.all(
      [...customerCodes].filter(Boolean).map((customerCode) =>
        this.ensureCustomerHasAdsHandling(stationCode, customerCode),
      ),
    );

    return { created, reactivated };
  }

  /** Airline master currency. Blank or unknown stays INR. */
  private async currencyByCustomer(
    stationCode: string,
    customerCodes: string[],
  ): Promise<Map<string, BillingCurrency>> {
    const unique = [...new Set(customerCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
    const map = new Map<string, BillingCurrency>();
    for (const code of unique) map.set(code, 'INR');
    if (unique.length === 0) return map;
    const customers = await this.customerModel
      .find({ stationCode, customerCode: { $in: unique } })
      .select('customerCode currencyCode')
      .lean();
    for (const customer of customers) {
      const code = String(customer.customerCode ?? '').trim().toUpperCase();
      if (!code) continue;
      map.set(code, resolveBillingCurrency(customer.currencyCode));
    }
    return map;
  }

  /**
   * UI-created BHS rows omitted currency and displayed as INR.
   * Fill only blank currencies from the customer master. Rows that already
   * store INR or USD are left as saved.
   */
  private async backfillMissingBhsCurrency(ctx: StationScopeContext): Promise<void> {
    const stationCode = StationScope.require(ctx);
    const usdCustomers = await this.customerModel
      .find(StationScope.filter({ currencyCode: 'USD' }, ctx))
      .select('customerCode')
      .lean();
    const codes = usdCustomers
      .map((customer) => String(customer.customerCode ?? '').trim().toUpperCase())
      .filter(Boolean);
    if (codes.length === 0) return;
    await this.entryModel.updateMany(
      StationScope.filter(
        {
          handlingType: 'BHS',
          active: true,
          customerCode: { $in: codes },
          $or: [
            { currencyCode: { $exists: false } },
            { currencyCode: null },
            { currencyCode: '' },
          ],
        },
        ctx,
      ),
      { $set: { currencyCode: 'USD' } },
    );
  }

  private twinLookupKey(row: {
    customerCode?: string;
    aircraftType?: string;
    category?: string;
    validFrom?: Date | string;
    validTo?: Date | string;
  }): string {
    const from =
      row.validFrom instanceof Date
        ? row.validFrom.toISOString()
        : new Date(String(row.validFrom ?? '')).toISOString();
    const to =
      row.validTo instanceof Date
        ? row.validTo.toISOString()
        : new Date(String(row.validTo ?? '')).toISOString();
    return [
      String(row.customerCode ?? '').trim().toUpperCase(),
      String(row.aircraftType ?? '').trim().toUpperCase(),
      String(row.category ?? '').trim(),
      from,
      to,
    ].join('|');
  }

  async createBulk(
    ctx: StationScopeContext,
    dto: BulkCreateBillingPriceCardAirlinesDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const handlingType = dto.handlingType;
    const created: BillingPriceCardAirline[] = [];
    const createdIds: Types.ObjectId[] = [];
    const customerCodes = new Set<string>();
    const currencyByCustomer = await this.currencyByCustomer(
      stationCode,
      dto.rows.map((row) => row.customerCode.trim().toUpperCase()),
    );

    for (const row of dto.rows) {
      const customerCode = row.customerCode.trim().toUpperCase();
      const aircraftType = row.aircraftType.trim();
      if (!aircraftType) {
        throw new ConflictException('Aircraft type is required on every row.');
      }

      if (handlingType === 'BHS') {
        if (row.price == null || !Number.isFinite(row.price) || row.price < 0) {
          throw new BadRequestException(
            `Price is required for BHS rows (${customerCode} · ${aircraftType}).`,
          );
        }
      }

      const doc = await this.entryModel.create(
        StationScope.stampCreate(
          {
            handlingType,
            customerCode,
            airlineName: row.airlineName.trim(),
            validFrom: new Date(row.validFrom),
            validTo: new Date(row.validTo),
            remarks: row.remarks?.trim() || undefined,
            aircraftType,
            category: row.category,
            ...(handlingType === 'BHS' && row.price != null
              ? {
                  price: row.price,
                  currencyCode: currencyByCustomer.get(customerCode) ?? 'INR',
                  flightOperation: row.flightOperation === 'additional' ? 'additional' : 'scheduled',
                }
              : {}),
            active: true,
          },
          ctx,
        ),
      );
      created.push(doc.toObject());
      createdIds.push(doc._id);
      customerCodes.add(customerCode);

      // BHS structural changes → mirror ADS twin immediately.
      if (handlingType === 'BHS') {
        await this.ensureAdsTwin(ctx, {
          customerCode,
          airlineName: row.airlineName.trim(),
          aircraftType,
          category: row.category,
          validFrom: new Date(row.validFrom),
          validTo: new Date(row.validTo),
          remarks: row.remarks?.trim() || undefined,
        });
        await this.ensureCustomerHasAdsHandling(stationCode, customerCode);
      }
    }

    for (const customerCode of customerCodes) {
      const customer = await this.customerModel.findOne({ stationCode, customerCode });
      if (!customer) continue;
      const nextTypes = mergeHandlingTypes(customer.priceCardHandlingTypes, handlingType);
      if (
        JSON.stringify(nextTypes) !== JSON.stringify(customer.priceCardHandlingTypes ?? [])
      ) {
        customer.priceCardHandlingTypes = nextTypes;
        await customer.save();
      }
    }

    await this.auditEngine.log({
      entityType: 'price_card_airline',
      entityId: createdIds[0] ?? new Types.ObjectId(),
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: { handlingType, rowCount: created.length },
    });

    return successResponse({ items: created, total: created.length });
  }

  async update(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateBillingPriceCardAirlineDto,
    actor: BillingActor,
  ) {
    const doc = await this.entryModel.findById(id);
    if (!doc || !doc.active) throw new NotFoundException('Price card airline entry not found');
    StationScope.assertOwnership(doc, ctx);

    const aircraftType = dto.aircraftType.trim();
    if (!aircraftType) {
      throw new BadRequestException('Aircraft type is required.');
    }

    if (doc.handlingType === 'BHS') {
      if (dto.price == null || !Number.isFinite(dto.price) || dto.price < 0) {
        throw new BadRequestException('Price is required for BHS airline entries.');
      }
    }

    const beforeKey: TwinKey | null =
      doc.handlingType === 'BHS'
        ? {
            customerCode: doc.customerCode,
            aircraftType: doc.aircraftType,
            category: doc.category,
            validFrom: doc.validFrom,
            validTo: doc.validTo,
          }
        : null;

    const before = doc.toObject();
    doc.airlineName = dto.airlineName.trim();
    doc.validFrom = new Date(dto.validFrom);
    doc.validTo = new Date(dto.validTo);
    doc.remarks = dto.remarks?.trim() || undefined;
    doc.aircraftType = aircraftType;
    doc.category = dto.category;
    if (doc.handlingType === 'BHS') {
      doc.price = dto.price;
      doc.flightOperation = dto.flightOperation === 'additional' ? 'additional' : 'scheduled';
      const incrementalOn = dto.incrementalFlightsActive === true;
      doc.incrementalFlightsActive = incrementalOn;
      doc.incrementalPrice =
        incrementalOn &&
        dto.incrementalPrice != null &&
        Number.isFinite(dto.incrementalPrice) &&
        dto.incrementalPrice >= 0
          ? dto.incrementalPrice
          : undefined;
      if (incrementalOn && !(Number(doc.incrementalPrice) > 0)) {
        throw new BadRequestException(
          'Enter an incremental price greater than zero, or turn incremental flights off.',
        );
      }
      if (!String(doc.currencyCode ?? '').trim()) {
        const code = String(doc.customerCode ?? '').trim().toUpperCase();
        const currencyByCustomer = await this.currencyByCustomer(doc.stationCode, [code]);
        doc.currencyCode = currencyByCustomer.get(code) ?? 'INR';
      }
    }
    await doc.save();

    if (doc.handlingType === 'BHS' && beforeKey) {
      await this.syncAdsTwinAfterBhsUpdate(ctx, beforeKey, {
        customerCode: doc.customerCode,
        airlineName: doc.airlineName,
        aircraftType: doc.aircraftType,
        category: doc.category,
        validFrom: doc.validFrom,
        validTo: doc.validTo,
        remarks: doc.remarks,
      });
      await this.ensureCustomerHasAdsHandling(doc.stationCode, doc.customerCode);
    }

    await this.auditEngine.log({
      entityType: 'price_card_airline',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { before, after: doc.toObject() },
    });

    return successResponse(doc.toObject());
  }

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.entryModel.findById(id);
    if (!doc) throw new NotFoundException('Price card airline entry not found');
    StationScope.assertOwnership(doc, ctx);

    const snapshot = doc.toObject();
    doc.active = false;
    await doc.save();

    // Soft-delete matching ADS twin when BHS row is removed.
    if (snapshot.handlingType === 'BHS') {
      await this.softDeleteAdsTwin(ctx, {
        customerCode: snapshot.customerCode,
        aircraftType: snapshot.aircraftType,
        category: snapshot.category,
        validFrom: snapshot.validFrom,
        validTo: snapshot.validTo,
      });
    }

    await this.auditEngine.log({
      entityType: 'price_card_airline',
      entityId: doc._id,
      action: 'cancelled',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { deleted: true, entry: snapshot },
    });

    return successResponse({ deleted: true });
  }

  private async ensureAdsTwin(
    ctx: StationScopeContext,
    params: {
      customerCode: string;
      airlineName: string;
      aircraftType: string;
      category: string;
      validFrom: Date;
      validTo: Date;
      remarks?: string;
    },
  ): Promise<'created' | 'reactivated' | 'exists'> {
    const stationCode = StationScope.require(ctx);
    const customerCode = params.customerCode.trim().toUpperCase();
    const aircraftType = params.aircraftType.trim().toUpperCase();
    const category = String(params.category ?? '').trim();

    const existing = await this.entryModel.findOne({
      stationCode,
      handlingType: 'ADS',
      customerCode,
      aircraftType,
      category,
      validFrom: params.validFrom,
      validTo: params.validTo,
    });

    if (existing) {
      const wasInactive = !existing.active;
      let changed = false;
      if (!existing.active) {
        existing.active = true;
        changed = true;
      }
      if (params.airlineName.trim() && existing.airlineName !== params.airlineName.trim()) {
        existing.airlineName = params.airlineName.trim();
        changed = true;
      }
      const nextRemarks = params.remarks?.trim() || undefined;
      if ((nextRemarks ?? undefined) !== (existing.remarks ?? undefined)) {
        existing.remarks = nextRemarks;
        changed = true;
      }
      if (changed) await existing.save();
      return wasInactive ? 'reactivated' : 'exists';
    }

    await this.entryModel.create(
      StationScope.stampCreate(
        {
          handlingType: 'ADS',
          customerCode,
          airlineName: params.airlineName.trim() || customerCode,
          aircraftType,
          category,
          validFrom: params.validFrom,
          validTo: params.validTo,
          remarks: params.remarks?.trim() || undefined,
          active: true,
        },
        ctx,
      ),
    );
    return 'created';
  }

  private async syncAdsTwinAfterBhsUpdate(
    ctx: StationScopeContext,
    before: TwinKey,
    after: {
      customerCode: string;
      airlineName: string;
      aircraftType: string;
      category: string;
      validFrom: Date;
      validTo: Date;
      remarks?: string;
    },
  ) {
    const stationCode = StationScope.require(ctx);
    const ads = await this.entryModel.findOne({
      stationCode,
      handlingType: 'ADS',
      customerCode: before.customerCode,
      aircraftType: before.aircraftType.trim().toUpperCase(),
      category: before.category,
      validFrom: before.validFrom,
      validTo: before.validTo,
    });

    if (ads) {
      ads.customerCode = after.customerCode.trim().toUpperCase();
      ads.airlineName = after.airlineName.trim();
      ads.aircraftType = after.aircraftType.trim().toUpperCase();
      ads.category = after.category;
      ads.validFrom = after.validFrom;
      ads.validTo = after.validTo;
      ads.remarks = after.remarks?.trim() || undefined;
      ads.active = true;
      await ads.save();
      return;
    }

    await this.ensureAdsTwin(ctx, after);
  }

  private async softDeleteAdsTwin(ctx: StationScopeContext, key: TwinKey) {
    const stationCode = StationScope.require(ctx);
    const ads = await this.entryModel.findOne({
      stationCode,
      handlingType: 'ADS',
      customerCode: key.customerCode,
      aircraftType: key.aircraftType.trim().toUpperCase(),
      category: key.category,
      validFrom: key.validFrom,
      validTo: key.validTo,
      active: true,
    });
    if (!ads) return;
    ads.active = false;
    await ads.save();
  }

  private async ensureCustomerHasAdsHandling(stationCode: string, customerCode: string) {
    const customer = await this.customerModel.findOne({
      stationCode,
      customerCode: customerCode.trim().toUpperCase(),
    });
    if (!customer) return;
    const nextTypes = mergeHandlingTypes(customer.priceCardHandlingTypes, 'ADS');
    if (JSON.stringify(nextTypes) !== JSON.stringify(customer.priceCardHandlingTypes ?? [])) {
      customer.priceCardHandlingTypes = nextTypes;
      await customer.save();
    }
  }
}

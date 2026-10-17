import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingExchangeRate,
  BillingExchangeRateDocument,
  BillingSequence,
  BillingSequenceDocument,
  BillingSettings,
  BillingSettingsDocument,
  BillingTaxRule,
  BillingTaxRuleDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  successResponse,
} from '../common/station-scope';
import {
  CreateExchangeRateDto,
  CreateSequenceDto,
  CreateTaxRuleDto,
  EffectiveExchangeRateQueryDto,
  RoyaltySideDto,
  UpdateBillingSettingsDto,
  UpdateExchangeRateDto,
  UpdateSequenceDto,
  UpdateTaxRuleDto,
} from '../dto/billing-settings.dto';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import type { BillingSessionOptions } from '../common/billing-transaction';
import { mergeBillingSettingsWithRegistry } from '../utils/billing-station-profile.util';
import {
  defaultSequencePrefix,
  documentTypeFromSequenceCode,
} from '../common/billing-fiscal-year.util';

function storeRoyaltySide(side: RoyaltySideDto) {
  return {
    effectiveFrom: new Date(side.effectiveFrom),
    effectiveTo: new Date(side.effectiveTo),
    scheduledInternational: { percent: side.scheduledInternational.percent },
    scheduledDomestic: { percent: side.scheduledDomestic.percent },
    generalAviation: { percent: side.generalAviation.percent },
  };
}

@Injectable()
export class BillingSettingsService {
  constructor(
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async get(ctx: StationScopeContext) {
    const stationCode = StationScope.require(ctx);
    let doc = await this.settingsModel.findOne(StationScope.filter({}, ctx)).lean();
    if (!doc) {
      doc = (
        await this.settingsModel.create(
          StationScope.stampCreate({ approvalRequired: true }, ctx),
        )
      ).toObject();
    }

    const { merged, changed } = mergeBillingSettingsWithRegistry(doc, stationCode);
    if (changed) {
      await this.settingsModel.findOneAndUpdate(
        StationScope.filter({}, ctx),
        {
          $set: {
            gstStateCode: merged.gstStateCode,
            companyLegalEntity: merged.companyLegalEntity,
          },
        },
        { upsert: true },
      );
    }

    return successResponse(merged);
  }

  async update(ctx: StationScopeContext, dto: UpdateBillingSettingsDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const setPayload: Record<string, unknown> = { ...dto };
    const existing =
      dto.airportCommercial || dto.royaltyMaster
        ? await this.settingsModel.findOne(StationScope.filter({}, ctx)).lean()
        : null;
    if (dto.airportCommercial) {
      const rules = dto.airportCommercial;
      const prev = existing?.airportCommercial;
      const mag = Boolean(rules.minRevenueShareApplicable);
      const ceiling = mag ? (rules.ceilingRates ?? prev?.ceilingRates ?? []) : [];
      setPayload.airportCommercial = {
        ownership: rules.ownership,
        minRevenueShareApplicable: mag,
        magCurrency: mag ? (rules.magCurrency ?? prev?.magCurrency ?? 'INR') : undefined,
        ceilingRates: ceiling,
        revenueShareMechanism:
          rules.ownership === 'private'
            ? (rules.revenueShareMechanism ?? prev?.revenueShareMechanism)
            : undefined,
        revenueSharePercent: rules.revenueSharePercent ?? prev?.revenueSharePercent,
        effectiveFrom: rules.effectiveFrom
          ? new Date(rules.effectiveFrom)
          : prev?.effectiveFrom,
        effectiveTo: rules.effectiveTo ? new Date(rules.effectiveTo) : prev?.effectiveTo,
      };
    }
    if (dto.royaltyMaster) {
      const prev = existing?.royaltyMaster ?? {};
      const next: NonNullable<BillingSettings['royaltyMaster']> = { ...prev };
      for (const side of ['net', 'gross'] as const) {
        const incoming = dto.royaltyMaster[side];
        if (!incoming) continue;
        next[side] = storeRoyaltySide(incoming);
      }
      setPayload.royaltyMaster = next;
    }
    if (setPayload.approvalRequired === undefined) {
      setPayload.approvalRequired = true;
    }

    const doc = await this.settingsModel.findOneAndUpdate(
      StationScope.filter({}, ctx),
      {
        $set: setPayload,
        $setOnInsert: { stationCode },
      },
      { returnDocument: 'after', upsert: true },
    );

    await this.auditEngine.log({
      entityType: 'settings',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: dto as Record<string, unknown>,
    });

    return successResponse(doc.toObject());
  }
}

@Injectable()
export class BillingTaxRulesService {
  constructor(
    @InjectModel(BillingTaxRule.name)
    private readonly taxRuleModel: Model<BillingTaxRuleDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext) {
    const items = await this.taxRuleModel
      .find(StationScope.filter({}, ctx))
      .sort({ effectiveFrom: -1 })
      .lean();
    return successResponse({ items, total: items.length });
  }

  async create(ctx: StationScopeContext, dto: CreateTaxRuleDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const half = dto.gstPercent / 2;
    const created = await this.taxRuleModel.create(
      StationScope.stampCreate(
        {
          ...dto,
          cgstPercent: dto.placeOfSupply === 'intra_state' ? half : 0,
          sgstPercent: dto.placeOfSupply === 'intra_state' ? half : 0,
          igstPercent: dto.placeOfSupply === 'inter_state' ? dto.gstPercent : 0,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: new Date(dto.effectiveTo),
        },
        ctx,
      ),
    );

    await this.auditEngine.log({
      entityType: 'tax_rule',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    return successResponse(created.toObject());
  }

  async update(ctx: StationScopeContext, id: string, dto: UpdateTaxRuleDto, actor: BillingActor) {
    const doc = await this.taxRuleModel.findById(id);
    if (!doc) throw new NotFoundException('Tax rule not found');
    StationScope.assertOwnership(doc, ctx);

    if (dto.gstPercent !== undefined) {
      doc.gstPercent = dto.gstPercent;
      const half = dto.gstPercent / 2;
      doc.cgstPercent = doc.placeOfSupply === 'intra_state' ? half : 0;
      doc.sgstPercent = doc.placeOfSupply === 'intra_state' ? half : 0;
      doc.igstPercent = doc.placeOfSupply === 'inter_state' ? dto.gstPercent : 0;
    }
    if (dto.placeOfSupply) {
      doc.placeOfSupply = dto.placeOfSupply;
      const half = doc.gstPercent / 2;
      doc.cgstPercent = dto.placeOfSupply === 'intra_state' ? half : 0;
      doc.sgstPercent = dto.placeOfSupply === 'intra_state' ? half : 0;
      doc.igstPercent = dto.placeOfSupply === 'inter_state' ? doc.gstPercent : 0;
    }
    if (dto.effectiveFrom) doc.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo) doc.effectiveTo = new Date(dto.effectiveTo);
    await doc.save();

    await this.auditEngine.log({
      entityType: 'tax_rule',
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
}

@Injectable()
export class BillingExchangeRatesService {
  constructor(
    @InjectModel(BillingExchangeRate.name)
    private readonly rateModel: Model<BillingExchangeRateDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext) {
    const items = await this.rateModel
      .find(StationScope.filter({}, ctx))
      .sort({ startingDate: -1 })
      .lean();
    return successResponse({ items, total: items.length });
  }

  async create(ctx: StationScopeContext, dto: CreateExchangeRateDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const startingDate = resolveExchangeRateStartingDate(dto);
    const currencyCode = dto.currencyCode.toUpperCase();

    const existing = await this.rateModel.findOne(
      StationScope.filter({ currencyCode, startingDate }, ctx),
    );

    if (existing) {
      existing.rateToINR = dto.rateToINR;
      if (dto.source) existing.source = dto.source;
      await existing.save();
      await this.auditEngine.log({
        entityType: 'exchange_rate',
        entityId: existing._id,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode,
        changes: { rateToINR: dto.rateToINR, source: dto.source, upsertMonth: true },
      });
      return successResponse(existing.toObject());
    }

    const created = await this.rateModel.create(
      StationScope.stampCreate(
        {
          currencyCode,
          rateToINR: dto.rateToINR,
          startingDate,
          source: dto.source ?? 'manual',
        },
        ctx,
      ),
    );

    await this.auditEngine.log({
      entityType: 'exchange_rate',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    return successResponse(created.toObject());
  }

  async getEffective(ctx: StationScopeContext, query: EffectiveExchangeRateQueryDto) {
    const currencyCode = query.currencyCode.toUpperCase();
    if (currencyCode === 'INR') {
      throw new NotFoundException('INR does not use an exchange rate');
    }

    const yearMonth = (() => {
      const raw = String(query.date ?? '').trim();
      const ymd = /^(\d{4})-(\d{2})/.exec(raw);
      if (ymd) return `${ymd[1]}-${ymd[2]}`;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 7);
    })();
    if (!yearMonth) throw new NotFoundException('No exchange rate for date');

    const [y, m] = yearMonth.split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const localMonthStart = new Date(y, m - 1, 1);
    const localMonthEnd = new Date(y, m, 0, 23, 59, 59, 999);

    const monthRate = await this.rateModel
      .findOne(
        StationScope.filter(
          {
            currencyCode,
            startingDate: { $gte: monthStart, $lte: monthEnd },
          },
          ctx,
        ),
      )
      .sort({ startingDate: -1 })
      .lean();
    if (monthRate) return successResponse(monthRate);

    const localMonthRate = await this.rateModel
      .findOne(
        StationScope.filter(
          {
            currencyCode,
            startingDate: { $gte: localMonthStart, $lte: localMonthEnd },
          },
          ctx,
        ),
      )
      .sort({ startingDate: -1 })
      .lean();
    if (localMonthRate) return successResponse(localMonthRate);

    const rate = await this.rateModel
      .findOne(
        StationScope.filter(
          {
            currencyCode,
            startingDate: { $lte: monthEnd },
          },
          ctx,
        ),
      )
      .sort({ startingDate: -1 })
      .lean();
    if (!rate) throw new NotFoundException('No exchange rate for date');
    return successResponse(rate);
  }

  async update(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateExchangeRateDto,
    actor: BillingActor,
  ) {
    const doc = await this.rateModel.findById(id);
    if (!doc) throw new NotFoundException('Exchange rate not found');
    StationScope.assertOwnership(doc, ctx);

    if (dto.rateToINR !== undefined) doc.rateToINR = dto.rateToINR;
    if (dto.source) doc.source = dto.source;
    await doc.save();

    await this.auditEngine.log({
      entityType: 'exchange_rate',
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

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.rateModel.findById(id);
    if (!doc) throw new NotFoundException('Exchange rate not found');
    StationScope.assertOwnership(doc, ctx);

    const snapshot = doc.toObject();
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'exchange_rate',
      entityId: doc._id,
      action: 'deleted',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: {
        currencyCode: snapshot.currencyCode,
        rateToINR: snapshot.rateToINR,
        startingDate: snapshot.startingDate,
      },
    });

    return successResponse({ deleted: true, id });
  }
}

function resolveExchangeRateStartingDate(dto: CreateExchangeRateDto): Date {
  if (dto.yearMonth && /^\d{4}-\d{2}$/.test(dto.yearMonth)) {
    const [y, m] = dto.yearMonth.split('-').map(Number);
    // Store as UTC first-of-month so month matching is timezone-safe.
    return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  }
  if (dto.startingDate) {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(dto.startingDate.trim());
    if (ymd) {
      return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, 1, 0, 0, 0, 0));
    }
    const d = new Date(dto.startingDate);
    if (!Number.isNaN(d.getTime())) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
    }
  }
  throw new BadRequestException('Provide yearMonth (YYYY-MM) or startingDate');
}

@Injectable()
export class BillingSequencesService {
  constructor(
    @InjectModel(BillingSequence.name)
    private readonly sequenceModel: Model<BillingSequenceDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext) {
    const items = await this.sequenceModel
      .find(StationScope.filter({}, ctx))
      .sort({ fiscalYear: -1, sequenceCode: 1 })
      .lean();
    return successResponse({ items, total: items.length });
  }

  async create(ctx: StationScopeContext, dto: CreateSequenceDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const created = await this.sequenceModel.create(
      StationScope.stampCreate({ ...dto, currentValue: 0 }, ctx),
    );

    await this.auditEngine.log({
      entityType: 'sequence',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    return successResponse(created.toObject());
  }

  async update(ctx: StationScopeContext, id: string, dto: UpdateSequenceDto, actor: BillingActor) {
    const doc = await this.sequenceModel.findById(id);
    if (!doc) throw new NotFoundException('Sequence not found');
    StationScope.assertOwnership(doc, ctx);

    if (dto.prefix) doc.prefix = dto.prefix;
    if (dto.currentValue !== undefined) doc.currentValue = dto.currentValue;
    await doc.save();

    await this.auditEngine.log({
      entityType: 'sequence',
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

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.sequenceModel.findById(id);
    if (!doc) throw new NotFoundException('Sequence not found');
    StationScope.assertOwnership(doc, ctx);

    const snapshot = doc.toObject();
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'sequence',
      entityId: doc._id,
      action: 'deleted',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: {
        sequenceCode: snapshot.sequenceCode,
        prefix: snapshot.prefix,
        fiscalYear: snapshot.fiscalYear,
        currentValue: snapshot.currentValue,
      },
    });

    return successResponse({ deleted: true, id });
  }

  async nextNumber(
    ctx: StationScopeContext,
    sequenceCode: string,
    fiscalYear: string,
    options?: BillingSessionOptions,
  ): Promise<string> {
    const stationCode = StationScope.require(ctx);
    const documentType = documentTypeFromSequenceCode(sequenceCode);
    const bumpOpts = {
      returnDocument: 'after' as const,
      session: options?.session,
    };

    const bump = (filter: Record<string, unknown>) =>
      this.sequenceModel.findOneAndUpdate(
        filter,
        { $inc: { currentValue: 1 } },
        bumpOpts,
      );

    let seq = await bump({ stationCode, sequenceCode, fiscalYear });
    if (!seq) {
      seq = await bump({ stationCode, fiscalYear, documentType });
    }
    if (!seq) {
      await this.ensureDefaultSequence(
        ctx,
        sequenceCode,
        fiscalYear,
        documentType,
        options,
      );
      seq = await bump({ stationCode, sequenceCode, fiscalYear });
    }
    if (!seq) {
      throw new BadRequestException(
        `Sequence not configured for ${sequenceCode} / FY ${fiscalYear}. Open Master → Airport Setup → Invoice sequences and add code ${sequenceCode} for year ${fiscalYear}.`,
      );
    }
    const padded = String(seq.currentValue).padStart(4, '0');
    return `${seq.prefix}${padded}`;
  }

  private async ensureDefaultSequence(
    ctx: StationScopeContext,
    sequenceCode: string,
    fiscalYear: string,
    documentType: 'invoice' | 'credit_memo',
    options?: BillingSessionOptions,
  ): Promise<void> {
    const stationCode = StationScope.require(ctx);
    const payload = StationScope.stampCreate(
      {
        sequenceCode,
        prefix: defaultSequencePrefix(documentType, stationCode, fiscalYear),
        fiscalYear,
        documentType,
        currentValue: 0,
      },
      ctx,
    );
    try {
      if (options?.session) {
        await this.sequenceModel.create([payload], { session: options.session });
      } else {
        await this.sequenceModel.create(payload);
      }
    } catch (err) {
      if (!isMongoDuplicateKey(err)) throw err;
    }
  }
}

function isMongoDuplicateKey(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000,
  );
}

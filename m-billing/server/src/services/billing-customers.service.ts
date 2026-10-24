import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { withBillingTransaction } from '../common/billing-transaction';
import {
  BillingContract,
  BillingContractDocument,
  BillingCustomer,
  BillingCustomerDocument,
  BillingRateCard,
  BillingRateCardDocument,
} from '../schemas/billing.schemas';
import {
  AdvanceAirlineRead,
  AdvanceAirlineReadDocument,
  AdvanceGatewayScheduledAirlineRead,
  AdvanceGatewayScheduledAirlineReadDocument,
  AdvanceScheduleSetupRead,
  AdvanceScheduleSetupReadDocument,
} from '../schemas/operational.schemas';
import {
  extractScheduledAirlineCustomer,
  isScheduleSetupRowEnabled,
  joinUniqueValues,
} from '../utils/gateway-scheduled-customer-sync.util';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import {
  CreateBillingCustomerDto,
  ListBillingCustomersQueryDto,
  UpdateBillingCustomerDto,
} from '../dto/billing-customer.dto';
import { AuditEngineService } from '../engines/audit-engine.service';
import { formatParentCompanyAddress } from '../utils/customer-address.util';
import { FileStorageService } from 'src/common/storage/file-storage.service';
import { type StoredCustomerAnnexures } from '../utils/customer-annexure.util';

export interface BillingActor {
  userId: string;
  userName: string;
  /** Human login/employee id; `userId` remains canonical Mongo id. */
  loginId?: string;
  userEmail?: string;
  role?: string;
  accountType?: 'admin' | 'user';
  stationId?: string;
  stationCode?: string;
  stationName?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
}

function normalizeCustomerScheduleLines(
  flightNumber?: string,
  aircraftType?: string,
): Array<{ flightNumber: string; aircraftType?: string }> {
  const flight = String(flightNumber ?? '').trim();
  const aircraft = String(aircraftType ?? '').trim();
  if (!flight) return [];
  return [
    {
      flightNumber: flight,
      aircraftType: aircraft || undefined,
    },
  ];
}

function presentCustomer<T extends { annexures?: StoredCustomerAnnexures | null }>(doc: T) {
  const rest = { ...doc };
  delete rest.annexures;
  return rest;
}

function joinCustomerFlightNumbers(
  lines: Array<{ flightNumber: string; aircraftType?: string }>,
): string | undefined {
  const unique = [
    ...new Set(
      lines.map((line) => String(line.flightNumber ?? '').trim().toUpperCase(),
        ).filter(Boolean),
    ),
  ];
  return unique.length > 0 ? unique.join(', ') : undefined;
}

@Injectable()
export class BillingCustomersService {
  constructor(
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    @InjectModel(AdvanceAirlineRead.name)
    private readonly advanceAirlineModel: Model<AdvanceAirlineReadDocument>,
    @InjectModel(AdvanceGatewayScheduledAirlineRead.name)
    private readonly gatewayScheduledAirlineModel: Model<AdvanceGatewayScheduledAirlineReadDocument>,
    @InjectModel(AdvanceScheduleSetupRead.name)
    private readonly scheduleSetupModel: Model<AdvanceScheduleSetupReadDocument>,
    private readonly auditEngine: AuditEngineService,
    private readonly fileStorage: FileStorageService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(ctx: StationScopeContext, query: ListBillingCustomersQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = StationScope.filter({}, ctx);
    const activeParam = String(query.active ?? 'true').trim().toLowerCase();
    if (activeParam === 'false') {
      filter.active = false;
    } else if (activeParam !== 'all') {
      filter.active = true;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { customerCode: new RegExp(term, 'i') },
        { name: new RegExp(term, 'i') },
      ];
    }

    const [items, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ customerCode: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.customerModel.countDocuments(filter),
    ]);

    return paginatedResponse(items.map((item) => presentCustomer(item)), total, page, limit);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.customerModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Customer not found');
    StationScope.assertOwnership(doc, ctx);
    return successResponse(presentCustomer(doc));
  }

  async create(
    ctx: StationScopeContext,
    dto: CreateBillingCustomerDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const customerCode = dto.customerCode.trim().toUpperCase();
    const flightNumber = dto.flightNumber?.trim().toUpperCase() || '';
    const aircraftType = dto.aircraftType?.trim().toUpperCase() || '';
    const existing = await this.customerModel.findOne({
      stationCode,
      customerCode,
    });
    const duplicateFlight = flightNumber
      ? await this.customerModel.exists({
          stationCode,
          _id: { $ne: existing?._id },
          $or: [
            { flightNumber },
            { 'scheduleLines.flightNumber': flightNumber },
          ],
        })
      : false;
    if (duplicateFlight) {
      throw new ConflictException(`Flight number ${flightNumber} already exists`,
      );
    }

    if (existing) {
      existing.name = dto.name.trim();
      existing.airlineInvoiceName = dto.airlineInvoiceName?.trim() || undefined;
      existing.billToCustomerCode = dto.billToCustomerCode?.trim() || undefined;
      existing.currencyCode = dto.currencyCode;
      existing.paymentTermsCode = dto.paymentTermsCode?.trim() || undefined;
      if (dto.invoiceTerms !== undefined) {
        existing.invoiceTerms = dto.invoiceTerms.trim() || undefined;
      }
      existing.gstRegistrationNo = dto.gstRegistrationNo?.trim() || undefined;
      existing.msmeRegistrationNo = dto.msmeRegistrationNo?.trim() || undefined;
      existing.address = dto.address?.trim() || undefined;
      existing.secondaryAddressEnabled = dto.secondaryAddressEnabled === true;
      existing.secondaryAddress = existing.secondaryAddressEnabled
        ? dto.secondaryAddress?.trim() || undefined
        : undefined;
      existing.blocked = dto.blocked ?? false;
      existing.active = dto.active ?? true;
      existing.showPanOnInvoice = dto.showPanOnInvoice ?? false;
      existing.panNumber = dto.panNumber?.trim().toUpperCase() || undefined;
      existing.showVatOnInvoice = dto.showVatOnInvoice ?? false;
      existing.vatNumber = dto.vatNumber?.trim().toUpperCase() || undefined;
      const currentLines = Array.isArray(existing.scheduleLines)
        ? [...existing.scheduleLines]
        : [];
      if (flightNumber) {
        const hasLine = currentLines.some(
          (line) => String(line.flightNumber ?? '').trim().toUpperCase() === flightNumber,
        );
        if (!hasLine) {
          currentLines.push({ flightNumber, aircraftType: aircraftType || undefined,
          });
        }
      }
      existing.scheduleLines = currentLines;
      existing.flightNumber = joinCustomerFlightNumbers(currentLines);
      existing.aircraftType =
        currentLines.length === 1 ? currentLines[0]?.aircraftType : existing.aircraftType;
      if (flightNumber) {
        existing.flightNumber = joinCustomerFlightNumbers(currentLines);
      }
      await existing.save();
      await this.auditEngine.log({
        entityType: 'customer',
        entityId: existing._id,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode,
      });
      return successResponse(presentCustomer(existing.toObject()));
    }

    const created = await this.customerModel.create(
      StationScope.stampCreate(
        {
          ...dto,
          customerCode,
          airlineInvoiceName: dto.airlineInvoiceName?.trim() || undefined,
          secondaryAddressEnabled: dto.secondaryAddressEnabled === true,
          secondaryAddress:
            dto.secondaryAddressEnabled === true
              ? dto.secondaryAddress?.trim() || undefined
              : undefined,
          flightNumber: flightNumber || undefined,
          aircraftType: aircraftType || undefined,
          scheduleLines: normalizeCustomerScheduleLines(flightNumber, aircraftType,
          ),
          blocked: dto.blocked ?? false,
          active: dto.active ?? true,
          showPanOnInvoice: dto.showPanOnInvoice ?? false,
          panNumber: dto.panNumber?.trim().toUpperCase() || undefined,
          showVatOnInvoice: dto.showVatOnInvoice ?? false,
          vatNumber: dto.vatNumber?.trim().toUpperCase() || undefined,
          invoiceTerms: dto.invoiceTerms?.trim() || undefined,
        },
        ctx,
      ),
    );

    await this.auditEngine.log({
      entityType: 'customer',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    return successResponse(presentCustomer(created.toObject()));
  }

  async update(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateBillingCustomerDto,
    actor: BillingActor,
  ) {
    const doc = await this.customerModel.findById(id);
    if (!doc) throw new NotFoundException('Customer not found');
    StationScope.assertOwnership(doc, ctx);

    const stationCode = doc.stationCode;
    const oldCode = doc.customerCode;
    const {
      customerCode: nextCodeRaw,
      flightNumber,
      aircraftType,
      active,
      blocked,
      ...rest
    } = dto;

    if (nextCodeRaw !== undefined) {
      const nextCode = nextCodeRaw.trim().toUpperCase();
      if (!nextCode || nextCode.length > 10) {
        throw new BadRequestException('Customer code is required (max 10 characters).',
        );
      }
      if (nextCode !== oldCode) {
        const exists = await this.customerModel.exists({
          stationCode,
          customerCode: nextCode,
          _id: { $ne: doc._id },
        });
        if (exists) {
          throw new ConflictException(`Customer ${nextCode} already exists`);
        }
        doc.customerCode = nextCode;
      }
    }

    const customerFields = { ...rest } as typeof rest & {
      stationCode?: string;
      invoiceTerms?: string;
      annexures?: unknown;
    };
    delete customerFields.stationCode;
    delete customerFields.annexures;
    if (dto.invoiceTerms !== undefined) {
      doc.invoiceTerms = dto.invoiceTerms.trim() || undefined;
      delete customerFields.invoiceTerms;
    }
    // Partial PATCH bodies are expanded to a full DTO, so omitted fields arrive
    // as undefined. Assigning those would wipe required values such as name.
    for (const [key, value] of Object.entries(customerFields)) {
      if (value !== undefined) {
        doc.set(key, value);
      }
    }
    if (flightNumber !== undefined) {
      doc.flightNumber = flightNumber.trim() || undefined;
    }
    if (aircraftType !== undefined) {
      doc.aircraftType = aircraftType.trim() || undefined;
    }
    if (flightNumber !== undefined || aircraftType !== undefined) {
      doc.scheduleLines = normalizeCustomerScheduleLines(
        flightNumber !== undefined ? flightNumber : doc.flightNumber,
        aircraftType !== undefined ? aircraftType : doc.aircraftType,
      );
    }
    if (active !== undefined) doc.active = active;
    if (blocked !== undefined) doc.blocked = blocked;
    if (dto.showPanOnInvoice !== undefined) {
      doc.showPanOnInvoice = dto.showPanOnInvoice;
    }
    if (dto.panNumber !== undefined) {
      doc.panNumber = dto.panNumber.trim().toUpperCase() || undefined;
    }
    if (dto.showVatOnInvoice !== undefined) {
      doc.showVatOnInvoice = dto.showVatOnInvoice;
    }
    if (dto.vatNumber !== undefined) {
      doc.vatNumber = dto.vatNumber.trim().toUpperCase() || undefined;
    }
    if (dto.airlineInvoiceName !== undefined) {
      doc.airlineInvoiceName = dto.airlineInvoiceName.trim() || undefined;
    }
    if (dto.secondaryAddressEnabled !== undefined) {
      doc.secondaryAddressEnabled = dto.secondaryAddressEnabled === true;
      if (!doc.secondaryAddressEnabled) doc.secondaryAddress = undefined;
    }
    if (dto.secondaryAddress !== undefined) {
      doc.secondaryAddress = doc.secondaryAddressEnabled
        ? dto.secondaryAddress.trim() || undefined
        : undefined;
    }

    const codeChanged = nextCodeRaw !== undefined && oldCode !== doc.customerCode;
    const auditChanges = {
      ...(dto as Record<string, unknown>),
      ...(codeChanged
        ? { customerCodeFrom: oldCode, customerCodeTo: doc.customerCode }
        : {}),
    };

    if (!codeChanged) {
      await doc.save();
      await this.auditEngine.log({
        entityType: 'customer',
        entityId: doc._id,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode: doc.stationCode,
        changes: auditChanges,
      });
      return successResponse(presentCustomer(doc.toObject()));
    }

    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      if (codeChanged) {
        const codeFilter = StationScope.filter({ customerCode: oldCode }, ctx);
        await Promise.all([
          this.contractModel.updateMany(
            codeFilter,
            { $set: { customerCode: doc.customerCode } },
            { session },
          ),
          this.rateCardModel.updateMany(
            codeFilter,
            { $set: { customerCode: doc.customerCode } },
            { session },
          ),
        ]);
      }

      await doc.save({ session });

      await this.auditEngine.log(
        {
          entityType: 'customer',
          entityId: doc._id,
          action: 'updated',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: doc.stationCode,
          changes: auditChanges,
        },
        { session, afterCommit },
      );

      return successResponse(presentCustomer(doc.toObject()));
    });
  }

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.customerModel.findById(id);
    if (!doc) throw new NotFoundException('Customer not found');
    StationScope.assertOwnership(doc, ctx);

    const customerCode = doc.customerCode;
    const stationCode = doc.stationCode;
    const [contractCount, rateCardCount] = await Promise.all([
      this.contractModel.countDocuments(StationScope.filter({ customerCode }, ctx),
      ),
      this.rateCardModel.countDocuments(StationScope.filter({ customerCode }, ctx),
      ),
    ]);
    if (contractCount > 0 || rateCardCount > 0) {
      throw new ConflictException(
        `Cannot delete ${customerCode}: remove linked contracts and rate cards first`,
      );
    }

    const snapshot = doc.toObject();
    await this.deleteAnnexureFiles(snapshot.annexures);
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'customer',
      entityId: snapshot._id,
      action: 'cancelled',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: { deleted: true, customer: snapshot },
    });

    return successResponse({ deleted: true });
  }

  async removeMany(ctx: StationScopeContext, ids: string[], actor: BillingActor,
  ) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    let deleted = 0;
    const failed: Array<{ id: string; customerCode?: string; message: string;
    }> = [];

    for (const id of uniqueIds) {
      try {
        await this.remove(ctx, id, actor);
        deleted += 1;
      } catch (err) {
        const doc = await this.customerModel.findById(id).lean();
        failed.push({
          id,
          customerCode: doc?.customerCode,
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }

    return successResponse({ deleted, failed, requested: uniqueIds.length });
  }

  async removeAll(ctx: StationScopeContext, actor: BillingActor) {
    const customers = await this.customerModel
      .find(StationScope.filter({ active: true }, ctx))
      .select('_id')
      .lean();
    const ids = customers.map((c) => String(c._id));
    return this.removeMany(ctx, ids, actor);
  }

  /**
   * Reconcile Customers against this station's active, complete Schedule Setup rows.
   * Payment terms and other billing-maintained fields are deliberately preserved.
   */
  async syncFromAdvanceAirline(ctx: StationScopeContext, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const [airlines, gatewayRows, scheduleRows, customers] = await Promise.all([
      this.advanceAirlineModel.find(StationScope.filter({}, ctx)).lean(),
      this.gatewayScheduledAirlineModel.find(StationScope.filter({}, ctx)).lean(),
      this.scheduleSetupModel.find(StationScope.filter({}, ctx)).lean(),
      this.customerModel.find(StationScope.filter({}, ctx)),
    ]);

    type Aggregate = {
      name: string;
      lines: Map<string, { flightNumber: string; aircraftType?: string }>;
      advanceAirlineId?: Types.ObjectId;
      gatewayScheduledAirlineId?: Types.ObjectId;
      address?: string;
      gstRegistrationNo?: string;
    };

    const parentCompanyProfile = (
      airline?: AdvanceAirlineReadDocument | Record<string, unknown> | null,
    ) => {
      const row = airline as
        | {
            address?: string;
            address2?: string;
            address3?: string;
            gstRegistrationNo?: string;
          }
        | undefined;
      return {
        address: formatParentCompanyAddress(row),
        gstRegistrationNo: row?.gstRegistrationNo?.trim().toUpperCase() || undefined,
      };
    };

    const airlineByCode = new Map(
      airlines
        .map((airline) => [
          String(airline.code ?? '').trim().toUpperCase(),
          airline,
        ] as const)
        .filter(([code]) => Boolean(code)),
    );
    const gatewayByCode = new Map(
      gatewayRows
        .map((gateway) => [
          String(gateway.code ?? '').trim().toUpperCase(),
          gateway,
        ] as const)
        .filter(([code]) => Boolean(code)),
    );

    const byCode = new Map<string, Aggregate>();
    let invalidSchedules = 0;
    let inactiveSchedules = 0;

    for (const row of scheduleRows) {
      const data = (row.data ?? {}) as Record<string, unknown>;
      if (!isScheduleSetupRowEnabled(data)) {
        inactiveSchedules += 1;
        continue;
      }
      const extracted = extractScheduledAirlineCustomer(data);
      const customerCode = extracted?.customerCode.trim().toUpperCase() ?? '';
      const advanceAirline = airlineByCode.get(customerCode);
      const gateway = gatewayByCode.get(customerCode);
      const name =
        extracted?.name.trim() ||
        String(gateway?.airlines ?? '').trim() ||
        String(advanceAirline?.name ?? '').trim();
      const flightNumber = extracted?.flightNo.trim().toUpperCase() ?? '';
      const aircraftType = extracted?.aircraftType.trim().toUpperCase() ?? '';
      if (!customerCode || !name || !flightNumber || !aircraftType) {
        invalidSchedules += 1;
        continue;
      }

      let aggregate = byCode.get(customerCode);
      if (!aggregate) {
        const profile = parentCompanyProfile(advanceAirline);
        aggregate = {
          name,
          lines: new Map(),
          advanceAirlineId: advanceAirline?._id as Types.ObjectId | undefined,
          gatewayScheduledAirlineId: gateway?._id as Types.ObjectId | undefined,
          address: profile.address,
          gstRegistrationNo: profile.gstRegistrationNo,
        };
        byCode.set(customerCode, aggregate);
      }
      const lineKey = `${flightNumber}|${aircraftType}`;
      aggregate.lines.set(lineKey, { flightNumber, aircraftType });
    }

    let created = 0;
    let updated = 0;
    let reactivated = 0;
    let deactivated = 0;
    const existingByCode = new Map(
      customers.map((customer) => [customer.customerCode.trim().toUpperCase(), customer]),
    );

    for (const [customerCode, agg] of byCode.entries()) {
      const scheduleLines = [...agg.lines.values()];
      const flightNumber = joinCustomerFlightNumbers(scheduleLines);
      const aircraftType = joinUniqueValues(
        scheduleLines.map((line) => line.aircraftType ?? '').filter(Boolean),
      );
      const existing = existingByCode.get(customerCode);
      if (existing) {
        if (!existing.active) reactivated += 1;
        existing.name = agg.name;
        existing.scheduleLines = scheduleLines;
        existing.flightNumber = flightNumber;
        existing.aircraftType = aircraftType;
        existing.currencyCode =
          existing.currencyCode === 'USD' ? 'USD' : 'INR';
        existing.advanceAirlineId = agg.advanceAirlineId;
        existing.gatewayScheduledAirlineId = agg.gatewayScheduledAirlineId;
        existing.active = true;
        if (agg.address) existing.address = agg.address;
        if (agg.gstRegistrationNo) existing.gstRegistrationNo = agg.gstRegistrationNo;
        await existing.save();
        updated += 1;
      } else {
        await this.customerModel.create({
          customerCode,
          name: agg.name,
          currencyCode: 'INR',
          blocked: false,
          active: true,
          stationCode,
          scheduleLines,
          flightNumber,
          aircraftType,
          address: agg.address,
          gstRegistrationNo: agg.gstRegistrationNo,
          advanceAirlineId: agg.advanceAirlineId,
          gatewayScheduledAirlineId: agg.gatewayScheduledAirlineId,
        });
        created += 1;
      }
    }

    for (const [code, airline] of airlineByCode.entries()) {
      const profile = parentCompanyProfile(airline);
      if (!profile.address && !profile.gstRegistrationNo) continue;
      const existing = existingByCode.get(code);
      if (!existing) continue;
      let dirty = false;
      if (profile.address && existing.address !== profile.address) {
        existing.address = profile.address;
        dirty = true;
      }
      if (
        profile.gstRegistrationNo &&
        existing.gstRegistrationNo !== profile.gstRegistrationNo
      ) {
        existing.gstRegistrationNo = profile.gstRegistrationNo;
        dirty = true;
      }
      if (dirty) await existing.save();
    }

    for (const customer of customers) {
      const customerCode = customer.customerCode.trim().toUpperCase();
      if (byCode.has(customerCode) || !customer.active) continue;
      customer.active = false;
      customer.scheduleLines = [];
      customer.flightNumber = undefined;
      customer.aircraftType = undefined;
      await customer.save();
      deactivated += 1;
    }

    const result = {
      created,
      updated,
      reactivated,
      deactivated,
      invalidSchedules,
      inactiveSchedules,
      sourceCount: byCode.size,
      stationCode,
    };

    await this.auditEngine.log({
      entityType: 'customer',
      entityId: new Types.ObjectId(),
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      stationCode,
      changes: {
        syncFromAdvanceAirline: result,
      },
    });

    return successResponse(result);
  }

  private async deleteAnnexureFiles(annexures?: StoredCustomerAnnexures | null) {
    const keys = [annexures?.ads?.fileKey, annexures?.bhs?.fileKey].filter(
      (key): key is string => Boolean(key),
    );
    await Promise.all(keys.map((key) => this.fileStorage.delete(key).catch(() => undefined)));
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import { BillingInvoiceDraftsService } from './billing-invoice-drafts.service';
import { BillingInvoicesService } from './billing-invoices.service';
import { ListInvoicesQueryDto } from '../dto/billing-invoice.dto';

@Injectable()
export class BillingInvoiceBinService {
  constructor(
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    private readonly auditEngine: AuditEngineService,
    private readonly draftsService: BillingInvoiceDraftsService,
    private readonly invoicesService: BillingInvoicesService,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination({
      ...query,
      limit: query.limit ?? '5000',
    });
    const filter: Record<string, unknown> = StationScope.filter({ ...IN_BIN_FILTER }, ctx);
    if (query.customerCode) filter.customerCode = query.customerCode.toUpperCase();

    const [items, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ binnedAt: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.invoiceModel.countDocuments(filter),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async moveToBin(ctx: StationScopeContext, ids: string[], actor: BillingActor) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    let moved = 0;
    const failed: Array<{ id: string; message: string; label?: string }> = [];

    for (const id of uniqueIds) {
      try {
        const header = await this.getOwnedHeaderDoc(ctx, id);
        if (header.inBin) {
          throw new BadRequestException('Invoice is already in the bin');
        }
        header.inBin = true;
        header.binnedAt = new Date();
        header.binnedBy = actor.userName;
        await header.save();
        await this.auditEngine.log({
          entityType: 'invoice',
          entityId: header._id,
          action: 'updated',
          userId: actor.userId,
          userName: actor.userName,
          stationCode: header.stationCode,
          changes: { movedToBin: true },
        });
        moved += 1;
      } catch (err) {
        const header = await this.invoiceModel.findById(id).lean();
        failed.push({
          id,
          label: header?.invoiceNumber ?? header?.draftNumber,
          message: err instanceof Error ? err.message : 'Move to bin failed',
        });
      }
    }

    return successResponse({ moved, failed, requested: uniqueIds.length });
  }

  async restoreFromBin(ctx: StationScopeContext, ids: string[], actor: BillingActor) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    let restored = 0;
    const failed: Array<{ id: string; message: string; label?: string }> = [];

    for (const id of uniqueIds) {
      try {
        const header = await this.getOwnedHeaderDoc(ctx, id);
        if (!header.inBin) {
          throw new BadRequestException('Invoice is not in the bin');
        }
        header.inBin = false;
        header.binnedAt = undefined;
        header.binnedBy = undefined;
        await header.save();
        await this.auditEngine.log({
          entityType: 'invoice',
          entityId: header._id,
          action: 'updated',
          userId: actor.userId,
          userName: actor.userName,
          stationCode: header.stationCode,
          changes: { restoredFromBin: true },
        });
        restored += 1;
      } catch (err) {
        const header = await this.invoiceModel.findById(id).lean();
        failed.push({
          id,
          label: header?.invoiceNumber ?? header?.draftNumber,
          message: err instanceof Error ? err.message : 'Restore failed',
        });
      }
    }

    return successResponse({ restored, failed, requested: uniqueIds.length });
  }

  async permanentDelete(ctx: StationScopeContext, ids: string[], actor: BillingActor) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const draftIds: string[] = [];
    const invoiceIds: string[] = [];
    const failed: Array<{ id: string; message: string; label?: string }> = [];

    for (const id of uniqueIds) {
      const header = await this.invoiceModel.findById(id);
      if (!header) {
        failed.push({ id, message: 'Invoice not found' });
        continue;
      }
      try {
        StationScope.assertOwnership(header, ctx);
      } catch {
        failed.push({ id, message: 'Invoice not found' });
        continue;
      }
      if (!header.inBin) {
        failed.push({
          id,
          label: header.invoiceNumber ?? header.draftNumber,
          message: 'Invoice is not in the bin',
        });
        continue;
      }
      if (['draft', 'pending_approval'].includes(header.status)) {
        draftIds.push(id);
      } else {
        invoiceIds.push(id);
      }
    }

    let deleted = 0;
    if (draftIds.length > 0) {
      const res = await this.draftsService.bulkDeleteDrafts(ctx, draftIds, actor);
      deleted += res.data.deleted ?? 0;
      failed.push(...(res.data.failed ?? []));
    }
    if (invoiceIds.length > 0) {
      const res = await this.invoicesService.removeMany(ctx, invoiceIds, actor);
      deleted += res.data.deleted ?? 0;
      failed.push(...(res.data.failed ?? []));
    }

    return successResponse({ deleted, failed, requested: uniqueIds.length });
  }

  private async getOwnedHeaderDoc(
    ctx: StationScopeContext,
    id: string,
  ): Promise<BillingInvoiceHeaderDocument> {
    const header = await this.invoiceModel.findById(id);
    if (!header) {
      throw new NotFoundException('Invoice not found');
    }
    StationScope.assertOwnership(header, ctx);
    return header;
  }
}

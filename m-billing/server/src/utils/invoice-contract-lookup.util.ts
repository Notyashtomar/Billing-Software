/**
 * Which contract an invoice bills against. Database lookup + short cache;
 * the percent math lives in invoice-concession.util.
 */
import { Model } from 'mongoose';
import type { StationScopeContext } from '../common/station-scope';
import { fixedStationScope, StationScope } from '../common/station-scope';
import type {
  BillingContract,
  BillingContractDocument,
} from '../schemas/billing.schemas';

export type InvoiceContractLookup = {
  contractId?: unknown;
  customerCode: string;
  documentDate: Date | string;
  /** Invoice / prep station. Wins over an unscoped admin session. */
  stationCode?: string | null;
};

function billingStationCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

/** Station the invoice must bill against. Never "any station". */
function stationForInvoiceContract(
  ctx: StationScopeContext,
  header: InvoiceContractLookup,
): string {
  const fromHeader = billingStationCode(header.stationCode);
  const fromCtx = billingStationCode(ctx.stationCode);
  if (!ctx.crossStation) return fromCtx || fromHeader;
  return fromHeader || fromCtx;
}

const contractLookupCache = new Map<
  string,
  { at: number; value: (BillingContract & { _id?: unknown }) | null }
>();

/** Drop cached contracts so the next invoice rebuild reads the concession page. */
export function invalidateInvoiceContractCache(): void {
  contractLookupCache.clear();
}

export async function resolveActiveContractForInvoice(
  contractModel: Model<BillingContractDocument>,
  ctx: StationScopeContext,
  header: InvoiceContractLookup,
): Promise<(BillingContract & { _id?: unknown }) | null> {
  const stationCode = stationForInvoiceContract(ctx, header);
  const cacheKey = `${stationCode}|${String(header.contractId ?? '')}|${header.customerCode}|${String(header.documentDate ?? '').slice(0, 10)}`;
  const cached = contractLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30_000) return cached.value;

  const store = (value: (BillingContract & { _id?: unknown }) | null) => {
    contractLookupCache.set(cacheKey, { at: Date.now(), value });
    return value;
  };

  if (!stationCode) return store(null);

  const stationCtx = fixedStationScope(stationCode);

  if (header.contractId) {
    const byId = await contractModel.findById(header.contractId).lean();
    if (byId && billingStationCode(byId.stationCode) === stationCode) {
      StationScope.assertOwnership(byId, stationCtx);
      return store(byId);
    }
  }

  const billingDate =
    header.documentDate instanceof Date
      ? header.documentDate
      : new Date(header.documentDate);
  if (Number.isNaN(billingDate.getTime())) return null;

  return store(
    await contractModel
      .findOne(
        StationScope.filter(
          {
            $or: [
              { customerCode: header.customerCode.toUpperCase() },
              { additionalCustomerCodes: header.customerCode.toUpperCase() },
            ],
            priceValidFrom: { $lte: billingDate },
            priceValidTo: { $gte: billingDate },
          },
          stationCtx,
        ),
      )
      .sort({ priceValidFrom: -1 })
      .lean(),
  );
}

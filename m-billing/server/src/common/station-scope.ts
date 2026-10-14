import {
  StationScope as FrisStationScope,
  buildStationScope,
  type StationScopeContext,
} from 'src/common/station/station-scope';

export type { StationScopeContext };
export { buildStationScope, fixedStationScope } from 'src/common/station/station-scope';

export const StationScope = {
  /**
   * A session that already has a station always reads that station only.
   * An unscoped admin flag must not pull another station's masters into this one.
   */
  filter<T extends Record<string, unknown>>(
    base: T,
    ctx: StationScopeContext,
    field?: string,
  ): T & Record<string, unknown> {
    const code = String(ctx.stationCode ?? '').trim();
    const scoped = code ? { ...ctx, crossStation: false, stationCode: code } : ctx;
    return FrisStationScope.filter(base, scoped, field);
  },
  stampCreate: FrisStationScope.stampCreate.bind(FrisStationScope),
  require: FrisStationScope.require.bind(FrisStationScope),
  assertOwnership(
    doc: { stationCode?: string | null } | null | undefined,
    ctx: StationScopeContext,
    field?: string,
  ) {
    FrisStationScope.assertOwnership(
      doc as Record<string, unknown> | null | undefined,
      ctx,
      field,
    );
  },
};

export {
  successResponse,
  paginatedResponse,
  parsePagination,
} from './billing-response.util';

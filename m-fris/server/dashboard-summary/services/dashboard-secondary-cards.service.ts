import { Injectable, Logger } from '@nestjs/common';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { EquipmentManpowerService } from 'src/equipment-manpower/services/equipment-manpower.service';
import { AdvanceAircraftService } from 'src/advance-aircraft/services/advance-aircraft.service';
import type { EquipmentUtilSlotMode } from 'src/equipment-manpower/services/equipment-manpower.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
  type StationScopeContext,
} from 'src/common/station/station-scope';

type DashboardBundleRow = Awaited<
  ReturnType<FhrCollectionService['findAllLeanForDashboardBundle']>
>['rows'][number];

export type DashboardSecondaryCardsPayload = {
  from: string;
  to: string;
  equipmentMode: EquipmentUtilSlotMode;
  airlineRatings: ReturnType<
    FhrCollectionService['aggregateAirlineRemarksRatingsFromLeanRows']
  >;
  aircraftCategory: ReturnType<
    FhrCollectionService['getScheduledCategoryBreakdownFromLeanRows']
  >;
  equipmentUtil: ReturnType<
    EquipmentManpowerService['aggregateDashboardEquipmentUtilFromLeanRows']
  >;
  _perf?: {
    totalMs: number;
    mongoWallMs: number;
    rowCount: number;
    staWindowCacheHit: boolean;
    aggregateMs: number;
    summaryCacheHit?: boolean;
  };
};

@Injectable()
export class DashboardSecondaryCardsService {
  private readonly logger = new Logger(DashboardSecondaryCardsService.name);

  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly equipmentManpowerService: EquipmentManpowerService,
    private readonly advanceAircraftService: AdvanceAircraftService,
  ) {}

  private static ymdRangeToDdMmYyyyList(
    fromYmd: string,
    toYmd: string,
  ): string[] {
    const list: string[] = [];
    const cur = new Date(`${fromYmd}T00:00:00Z`);
    const endMs = new Date(`${toYmd}T00:00:00Z`).getTime();
    while (cur.getTime() <= endMs) {
      const d = String(cur.getUTCDate()).padStart(2, '0');
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const y = cur.getUTCFullYear();
      list.push(`${d}/${m}/${y}`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return list;
  }

  async getBundle(
    fromYmd: string,
    toYmd: string,
    mode: EquipmentUtilSlotMode,
    options?: { bustCache?: boolean; station?: StationScopeContext },
  ): Promise<DashboardSecondaryCardsPayload> {
    const f = String(fromYmd ?? '').trim();
    const t = String(toYmd ?? '').trim();
    const normalizedMode: EquipmentUtilSlotMode =
      mode === '4h' ? '4h' : '6h';
    const wallStart = Date.now();
    // Live bundle is single-station: a cross-station caller resolves to its own
    // station (default legacy MAA) rather than blending all stations' rows.
    const rawScope = options?.station ?? CROSS_STATION_SYSTEM_SCOPE;
    const scope = rawScope.crossStation
      ? fixedStationScope(rawScope.stationCode ?? 'MAA')
      : rawScope;

    const dateStrings =
      DashboardSecondaryCardsService.ymdRangeToDdMmYyyyList(f, t);
    if (options?.bustCache) {
      this.fhrCollectionService.invalidateStaWindowRowsCache(dateStrings);
    }

    const fetched =
      await this.fhrCollectionService.findAllLeanForDashboardBundle(
        dateStrings,
        scope,
      );
    const rows = fetched.rows as DashboardBundleRow[];
    const mongoWallMs = fetched.queryMs;
    const staWindowCacheHit = fetched.cacheHit;

    const aggStart = Date.now();
    const [bodyCatalog, masterCatalog] = await Promise.all([
      this.advanceAircraftService.getActiveAircraftBodyMap(),
      this.equipmentManpowerService.getMasterCatalog(scope),
    ]);

    const airlineRatings =
      this.fhrCollectionService.aggregateAirlineRemarksRatingsFromLeanRows(
        rows,
        f,
        t,
      );
    const aircraftCategory =
      this.fhrCollectionService.getScheduledCategoryBreakdownFromLeanRows(
        rows,
        f,
        t,
        bodyCatalog,
      );
    const equipmentUtil =
      this.equipmentManpowerService.aggregateDashboardEquipmentUtilFromLeanRows(
        rows,
        normalizedMode,
        masterCatalog,
      );

    const aggregateMs = Date.now() - aggStart;
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dash_secondary] bundle ready from=${f} to=${t} mode=${normalizedMode} ` +
        `rows=${rows.length} staWindowCacheHit=${staWindowCacheHit} mongoWallMs=${mongoWallMs} ` +
        `aggregateMs=${aggregateMs} totalMs=${totalMs}`,
    );

    return {
      from: f,
      to: t,
      equipmentMode: normalizedMode,
      airlineRatings,
      aircraftCategory,
      equipmentUtil,
      _perf: {
        totalMs,
        mongoWallMs,
        rowCount: rows.length,
        staWindowCacheHit,
        aggregateMs,
        summaryCacheHit: false,
      },
    };
  }
}

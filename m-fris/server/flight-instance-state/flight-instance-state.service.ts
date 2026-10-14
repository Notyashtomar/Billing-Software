import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FlightInstanceState,
  FlightInstanceStateDocument,
} from './schema/flight-instance-state.schema';
import {
  StationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../common/station/station.constants';

@Injectable()
export class FlightInstanceStateService {
  constructor(
    @InjectModel(FlightInstanceState.name)
    private readonly model: Model<FlightInstanceStateDocument>,
  ) {}

  normalizeSerial(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/^FL-/i, '');
  }

  /**
   * Resolve the stationCode to stamp on a NEW state row. A scoped FRIS user (or
   * an admin with an active station) stamps that station; a cross-station admin
   * without an active station falls back to the legacy station (MAA), matching
   * current single-station production.
   */
  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async markCancelled(
    instanceSerial: string,
    station: StationScopeContext,
  ): Promise<void> {
    const s = this.normalizeSerial(instanceSerial);
    if (!s) return;
    // `instanceSerial` is globally unique (Strategy A): match on it alone so the
    // upsert always targets the single existing row and never inserts a
    // duplicate. stationCode is stamped only when a brand-new row is inserted
    // (`$setOnInsert`); existing legacy MAA rows are never reassigned.
    await this.model.findOneAndUpdate(
      { instanceSerial: s },
      {
        $set: { instanceSerial: s, isCancelled: true, lastAction: 'cancel' },
        $setOnInsert: { stationCode: this.stampStationCode(station) },
      },
      { upsert: true, new: true },
    );
  }

  async markReopened(
    instanceSerial: string,
    station: StationScopeContext,
  ): Promise<void> {
    const s = this.normalizeSerial(instanceSerial);
    if (!s) return;
    await this.model.findOneAndUpdate(
      { instanceSerial: s },
      {
        $set: { instanceSerial: s, isCancelled: false, lastAction: 'reopen' },
        $setOnInsert: { stationCode: this.stampStationCode(station) },
      },
      { upsert: true, new: true },
    );
  }

  /**
   * Subset of `serials` that are marked cancelled in `flight_instance_state`,
   * confined to the caller's station (legacy MAA rows remain visible to MAA).
   */
  async getCancelledSerialsInList(
    serials: string[],
    station: StationScopeContext,
  ): Promise<Set<string>> {
    const normalized = [
      ...new Set(
        serials.map((x) => this.normalizeSerial(x)).filter((x) => x.length > 0),
      ),
    ];
    if (normalized.length === 0) return new Set();
    const docs = await this.model
      .find(
        StationScope.filter(
          {
            instanceSerial: { $in: normalized },
            isCancelled: true,
          },
          station,
        ),
      )
      .select({ instanceSerial: 1 })
      .lean()
      .exec();
    return new Set(docs.map((d) => String(d.instanceSerial ?? '').trim()));
  }
}

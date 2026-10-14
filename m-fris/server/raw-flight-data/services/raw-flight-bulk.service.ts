import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, AnyBulkWriteOperation } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RawFlightData, RawFlightDataDocument } from '../schema/raw-flight-data.schema';
import { CreateRawFlightDataDto } from '../dto/create-raw-flight-data.dto';
import { StationScopeContext } from '../../common/station/station-scope';
import { normalizeStationCode, LEGACY_STATION_CODE } from '../../common/station/station.constants';
import { DASHBOARD_SOURCE_CHANGED } from '../../dashboard-summary/events/dashboard-events.constants';
import { DashboardSourceChangedEvent } from '../../dashboard-summary/events/dashboard-source-changed.event';
import { DASHBOARD_SOURCE_TYPES } from '../../dashboard-summary/registry/dashboard-dependency.registry';

@Injectable()
export class RawFlightBulkService {
  constructor(
    @InjectModel(RawFlightData.name)
    private readonly rawFlightDataModel: Model<RawFlightDataDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private stampStationCode(station: StationScopeContext): string {
    return normalizeStationCode(station.stationCode) ?? LEGACY_STATION_CODE;
  }

  async bulkInsert(flights: CreateRawFlightDataDto[], station: StationScopeContext) {
    if (!flights || flights.length === 0) {
      return {
        insertedCount: 0,
        message: 'No flights provided',
      };
    }

    const stationCode = this.stampStationCode(station);
    const ops: AnyBulkWriteOperation<RawFlightDataDocument>[] = [];

    for (const flight of flights) {
      const flightData = flight.data;
      const serial = flightData['Serial No'] || flightData.serialNo || flightData.SlNo;
      
      if (!serial) {
        // If no serial is present, just insert it instead of failing or matching nothing
        ops.push({
          insertOne: {
            document: { data: flightData, stationCode } as any,
          },
        });
        continue;
      }

      // Upsert based on serial and stationCode to prevent duplicates
      ops.push({
        updateOne: {
          filter: {
            $or: [
              { 'data.Serial No': serial },
              { 'data.serialNo': serial },
              { 'data.SlNo': serial },
            ],
            stationCode,
          },
          update: {
            $set: { data: flightData, stationCode },
          },
          upsert: true,
        },
      });
    }

    const docs = await this.rawFlightDataModel.bulkWrite(ops as any, { ordered: false });

    this.eventEmitter.emit(
      DASHBOARD_SOURCE_CHANGED,
      new DashboardSourceChangedEvent({
        sourceType: DASHBOARD_SOURCE_TYPES.RAW_FLIGHT_DATA,
        updatedAt: new Date(),
      }),
    );

    return {
      success: true,
      insertedCount: (docs.insertedCount || 0) + (docs.upsertedCount || 0),
      modifiedCount: docs.modifiedCount || 0,
    };
  }
}

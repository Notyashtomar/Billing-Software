import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RawFlightBulkService } from './raw-flight-bulk.service';
import { RawFlightData } from '../schema/raw-flight-data.schema';
import { DASHBOARD_SOURCE_CHANGED } from '../../dashboard-summary/events/dashboard-events.constants';
import { CROSS_STATION_SYSTEM_SCOPE } from '../../common/station/station-scope';

describe('RawFlightBulkService', () => {
  let service: RawFlightBulkService;
  let bulkWriteMock: jest.Mock;
  let eventEmitterEmitMock: jest.Mock;

  beforeEach(async () => {
    bulkWriteMock = jest.fn().mockResolvedValue({
      insertedCount: 1,
      upsertedCount: 1,
      modifiedCount: 0,
    });
    eventEmitterEmitMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RawFlightBulkService,
        {
          provide: getModelToken(RawFlightData.name),
          useValue: {
            bulkWrite: bulkWriteMock,
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: eventEmitterEmitMock,
          },
        },
      ],
    }).compile();

    service = module.get<RawFlightBulkService>(RawFlightBulkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('bulkInsert', () => {
    it('should return 0 insertedCount if no flights provided', async () => {
      const result = await service.bulkInsert([], CROSS_STATION_SYSTEM_SCOPE);
      expect(result.insertedCount).toBe(0);
      expect(result.message).toBe('No flights provided');
      expect(bulkWriteMock).not.toHaveBeenCalled();
    });

    it('should upsert flight based on Serial No and stationCode', async () => {
      const result = await service.bulkInsert(
        [
          {
            data: {
              'Serial No': '12345',
              Flight: 'BA123',
            },
          },
        ],
        CROSS_STATION_SYSTEM_SCOPE,
      );

      expect(bulkWriteMock).toHaveBeenCalledTimes(1);
      const ops = bulkWriteMock.mock.calls[0][0];
      expect(ops.length).toBe(1);

      const op = ops[0];
      expect(op.updateOne).toBeDefined();
      expect(op.updateOne.filter['$or']).toContainEqual({ 'data.Serial No': '12345' });
      expect(op.updateOne.filter.stationCode).toBe(CROSS_STATION_SYSTEM_SCOPE.stationCode);
      expect(op.updateOne.update.$set.data.Flight).toBe('BA123');
      expect(op.updateOne.upsert).toBe(true);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(2); // 1 inserted + 1 upserted from mock
      expect(eventEmitterEmitMock).toHaveBeenCalledWith(
        DASHBOARD_SOURCE_CHANGED,
        expect.anything(),
      );
    });

    it('should fallback to insertOne if no serial is provided', async () => {
      await service.bulkInsert(
        [
          {
            data: {
              Flight: 'BA999', // No serial
            },
          },
        ],
        CROSS_STATION_SYSTEM_SCOPE,
      );

      const ops = bulkWriteMock.mock.calls[0][0];
      expect(ops[0].insertOne).toBeDefined();
      expect(ops[0].insertOne.document.data.Flight).toBe('BA999');
    });
  });
});

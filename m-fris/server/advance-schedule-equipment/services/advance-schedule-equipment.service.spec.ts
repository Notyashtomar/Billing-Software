/// <reference types="jest" />
import { AdvanceScheduleEquipmentService } from './advance-schedule-equipment.service';
import { LEGACY_STATION_CODE } from '../../common/station/station.constants';

describe('AdvanceScheduleEquipmentService', () => {
  it('falls back to the legacy station code when no station context is provided', async () => {
    const exec = jest.fn().mockResolvedValue(null);

    class FakeModel {
      static findOne = jest.fn().mockReturnValue({ exec });

      constructor(public payload: Record<string, unknown>) {}

      save = jest.fn().mockImplementation(async function (this: FakeModel) {
        return this.payload;
      });
    }

    const service = new AdvanceScheduleEquipmentService(FakeModel as never);

    const result = await service.create(
      {
        airlineName: 'Air India',
        airlineCode: 'AI',
        aircraftBody: 'NB',
        equipmentName: 'Ambulift',
        equipmentCode: 'AMB',
      },
      { crossStation: false },
    );

    expect(result).toMatchObject({ stationCode: LEGACY_STATION_CODE });
  });
});

import { Types } from 'mongoose';
import { AuditEngineService } from './audit-engine.service';

describe('AuditEngineService (audit_log disabled)', () => {
  const input = {
    entityType: 'invoice',
    entityId: new Types.ObjectId(),
    action: 'posted',
    userId: new Types.ObjectId().toString(),
    userName: 'Finance User',
    stationCode: 'MAA',
  };

  it('does not persist audit_log or emit activity from log()', async () => {
    const insertOne = jest.fn().mockResolvedValue({});
    const emit = jest.fn();
    const service = new AuditEngineService(
      { insertOne } as never,
      { emit } as never,
    );

    await service.log(input);

    expect(insertOne).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not persist audit_log from logBulk()', async () => {
    const insertMany = jest.fn().mockResolvedValue([]);
    const emit = jest.fn();
    const service = new AuditEngineService(
      { insertMany } as never,
      { emit } as never,
    );

    await service.logBulk([
      { ...input, entityType: 'preparation', action: 'cancelled' },
      {
        ...input,
        entityId: new Types.ObjectId(),
        entityType: 'preparation',
        action: 'cancelled',
      },
    ]);

    expect(insertMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('still allows explicit emitActivity()', () => {
    const emit = jest.fn();
    const service = new AuditEngineService(
      { insertOne: jest.fn() } as never,
      { emit } as never,
    );

    service.emitActivity({
      userId: input.userId,
      userName: input.userName,
      accountType: 'user',
      action: 'test',
      summary: 'test',
      stationId: input.stationCode,
    });

    expect(emit).toHaveBeenCalledTimes(1);
  });
});

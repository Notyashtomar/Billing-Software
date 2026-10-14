import { ProtectionLoggerService } from './protection-logger.service';
import { ProtectionLogEvent } from './protection-log-events';

describe('ProtectionLoggerService', () => {
  it('formats structured protection events', () => {
    const svc = new ProtectionLoggerService();
    const warnSpy = jest
      .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    svc.logEvent(ProtectionLogEvent.RATE_LIMIT_BLOCKED, {
      route: '/reports/quality-scheduled-table',
      category: 'REPORTS',
      userId: 'EMP1021',
      retryAfter: 60,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RATE_LIMIT_BLOCKED]'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('userId=EMP1021'),
    );
    warnSpy.mockRestore();
  });
});

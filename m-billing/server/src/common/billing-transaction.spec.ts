import type { Connection } from 'mongoose';
import { withBillingTransaction } from './billing-transaction';

describe('withBillingTransaction', () => {
  function mockConnection(opts: {
    withTransactionImpl?: (fn: () => Promise<unknown>) => Promise<unknown>;
  } = {}) {
    const endSession = jest.fn().mockResolvedValue(undefined);
    const withTransaction = jest
      .fn()
      .mockImplementation(async (fn: () => Promise<unknown>) => {
        if (opts.withTransactionImpl) return opts.withTransactionImpl(fn);
        return fn();
      });
    const startSession = jest.fn().mockResolvedValue({
      withTransaction,
      endSession,
    });
    return {
      connection: { startSession } as unknown as Connection,
      startSession,
      withTransaction,
      endSession,
    };
  }

  it('commits work and runs afterCommit hooks only after success', async () => {
    const { connection, endSession } = mockConnection();
    const after = jest.fn();

    const result = await withBillingTransaction(connection, async (_session, defer) => {
      defer(() => after('email'));
      return 42;
    });

    expect(result).toBe(42);
    expect(after).toHaveBeenCalledWith('email');
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('does not run afterCommit when transaction throws', async () => {
    const { connection, endSession } = mockConnection({
      withTransactionImpl: async () => {
        throw new Error('line insert failed');
      },
    });
    const after = jest.fn();

    await expect(
      withBillingTransaction(connection, async (_session, defer) => {
        defer(() => after());
        return 'x';
      }),
    ).rejects.toThrow('line insert failed');

    expect(after).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('propagates mid-work exceptions so mongoose rolls back', async () => {
    const { connection } = mockConnection();

    await expect(
      withBillingTransaction(connection, async () => {
        throw new Error('audit save failed');
      }),
    ).rejects.toThrow('audit save failed');
  });
});

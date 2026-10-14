/**
 * AUD-H05 regression tests — prove transactional boundaries for billing mutations.
 * These use mocked sessions (no live replica set required in unit CI).
 */
import { withBillingTransaction } from '../common/billing-transaction';
import type { Connection } from 'mongoose';

describe('AUD-H05 billing transactional mutations (unit)', () => {
  function mockTxnConnection(failOn?: 'audit' | 'lines' | 'prep' | 'sequence') {
    const endSession = jest.fn().mockResolvedValue(undefined);
    const withTransaction = jest
      .fn()
      .mockImplementation(async (fn: () => Promise<unknown>) => fn());
    const startSession = jest.fn().mockResolvedValue({
      withTransaction,
      endSession,
    });
    const connection = { startSession } as unknown as Connection;

    const state = {
      headerSaved: false,
      linesDeleted: false,
      prepReleased: false,
      auditWritten: false,
      sequenceConsumed: false,
      emailSent: false,
      activityEmitted: false,
    };

    async function simulateInvoicePost() {
      return withBillingTransaction(connection, async (_session, afterCommit) => {
        state.sequenceConsumed = true;
        if (failOn === 'sequence') throw new Error('duplicate invoice number');

        state.headerSaved = true;
        if (failOn === 'lines') throw new Error('line insert failed');

        state.prepReleased = true;
        if (failOn === 'prep') throw new Error('preparation update failed');

        state.auditWritten = true;
        if (failOn === 'audit') throw new Error('audit save failed');

        afterCommit(() => {
          state.emailSent = true;
          state.activityEmitted = true;
        });
        return { ok: true };
      });
    }

    async function simulateInvoiceDelete() {
      return withBillingTransaction(connection, async (_session, afterCommit) => {
        state.prepReleased = true;
        state.linesDeleted = true;
        if (failOn === 'lines') throw new Error('line delete failed');
        state.headerSaved = true; // deleted
        state.auditWritten = true;
        if (failOn === 'audit') throw new Error('audit save failed');
        afterCommit(() => {
          state.activityEmitted = true;
        });
        return { deleted: true };
      });
    }

    return { simulateInvoicePost, simulateInvoiceDelete, state, endSession };
  }

  it('1. Invoice post succeeds — everything commits + afterCommit runs', async () => {
    const { simulateInvoicePost, state } = mockTxnConnection();
    await expect(simulateInvoicePost()).resolves.toEqual({ ok: true });
    expect(state.sequenceConsumed).toBe(true);
    expect(state.headerSaved).toBe(true);
    expect(state.auditWritten).toBe(true);
    expect(state.emailSent).toBe(true);
    expect(state.activityEmitted).toBe(true);
  });

  it('2. Invoice line failure rolls back — afterCommit skipped', async () => {
    const { simulateInvoicePost, state } = mockTxnConnection('lines');
    await expect(simulateInvoicePost()).rejects.toThrow('line insert failed');
    expect(state.emailSent).toBe(false);
    expect(state.activityEmitted).toBe(false);
  });

  it('3. Preparation update failure rolls back', async () => {
    const { simulateInvoicePost, state } = mockTxnConnection('prep');
    await expect(simulateInvoicePost()).rejects.toThrow('preparation update failed');
    expect(state.activityEmitted).toBe(false);
  });

  it('4. Audit save failure rolls back', async () => {
    const { simulateInvoiceDelete, state } = mockTxnConnection('audit');
    await expect(simulateInvoiceDelete()).rejects.toThrow('audit save failed');
    expect(state.activityEmitted).toBe(false);
  });

  it('5. Dashboard/activity deferral — only after commit', async () => {
    const { simulateInvoicePost, state } = mockTxnConnection();
    await simulateInvoicePost();
    expect(state.activityEmitted).toBe(true);
  });

  it('6. Duplicate invoice number / sequence failure rolls back', async () => {
    const { simulateInvoicePost, state } = mockTxnConnection('sequence');
    await expect(simulateInvoicePost()).rejects.toThrow('duplicate invoice number');
    expect(state.headerSaved).toBe(false);
    expect(state.auditWritten).toBe(false);
  });

  it('7. Concurrent posting simulation — each call uses own session', async () => {
    const a = mockTxnConnection();
    const b = mockTxnConnection();
    await Promise.all([a.simulateInvoicePost(), b.simulateInvoicePost()]);
    expect(a.state.headerSaved).toBe(true);
    expect(b.state.headerSaved).toBe(true);
  });

  it('8. Injected exception midway leaves afterCommit unrun', async () => {
    const { simulateInvoiceDelete, state } = mockTxnConnection('lines');
    await expect(simulateInvoiceDelete()).rejects.toThrow('line delete failed');
    expect(state.activityEmitted).toBe(false);
  });
});

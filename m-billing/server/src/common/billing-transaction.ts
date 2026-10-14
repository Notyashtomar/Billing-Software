import type { ClientSession, Connection } from 'mongoose';

/** Run after the Mongo transaction commits successfully (emails, EventEmitter, ADS sync). */
export type BillingAfterCommit = (fn: () => void | Promise<void>) => void;

export type BillingTransactionWork<T> = (
  session: ClientSession,
  afterCommit: BillingAfterCommit,
) => Promise<T>;

/**
 * Run billing multi-document writes in one Mongo transaction.
 * Deferred after-commit callbacks run only if the transaction commits.
 * Nested callers must reuse the same `session` — do not start a second transaction.
 */
export async function withBillingTransaction<T>(
  connection: Connection,
  work: BillingTransactionWork<T>,
): Promise<T> {
  const session = await connection.startSession();
  const deferred: Array<() => void | Promise<void>> = [];
  const afterCommit: BillingAfterCommit = (fn) => {
    deferred.push(fn);
  };

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session, afterCommit);
    });

    for (const fn of deferred) {
      await fn();
    }
    return result;
  } finally {
    await session.endSession();
  }
}

/** Optional session + after-commit hook for helper services. */
export type BillingSessionOptions = {
  session?: ClientSession;
  afterCommit?: BillingAfterCommit;
};

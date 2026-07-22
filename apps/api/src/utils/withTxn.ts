import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs `fn` inside a MongoDB transaction, retrying on transient write
 * conflicts. Requires the server to run as a replica set.
 * @param fn - Work to perform with the session; its return value is passed through
 */
export async function withTxn<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

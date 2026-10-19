import { sql } from "kysely";
import type { Database } from "../../src/db.js";
import { testDb as db } from "./db.js";

const lockWaiters = async () => {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from pg_stat_activity
    where wait_event_type = 'Lock' and datname = current_database()
  `.execute(db);
  return rows[0]!.n;
};

/** Resolves once at least `count` other backends are waiting on a lock. */
export async function waitForLockWait(count = 1, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await lockWaiters()) >= count) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`fewer than ${count} backends started waiting on a lock`);
}

/**
 * A starting gate for concurrency tests. Locks `table` in EXCLUSIVE mode,
 * which still allows plain reads but blocks every insert, then fires the
 * requests. Each one runs up to its first insert into `table` and waits there.
 * Once all of them are waiting, the lock is released and they race from the
 * same point, inside overlapping DB transactions.
 */
export async function releaseTogether<T>(
  table: keyof Database,
  requests: Array<() => Promise<T>>,
): Promise<T[]> {
  let inFlight!: Promise<T[]>;
  await db.transaction().execute(async (trx) => {
    await sql`lock table ${sql.table(table)} in exclusive mode`.execute(trx);
    inFlight = Promise.all(requests.map((r) => r()));
    await waitForLockWait(requests.length);
  });
  return inFlight;
}

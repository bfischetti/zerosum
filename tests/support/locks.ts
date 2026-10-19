import { sql } from "kysely";
import { testDb as db } from "./db.js";

/** Resolves once some other backend is waiting on a lock. */
export async function waitForLockWait(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from pg_stat_activity
      where wait_event_type = 'Lock' and datname = current_database()
    `.execute(db);
    if (rows[0]!.n > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("no backend started waiting on a lock");
}

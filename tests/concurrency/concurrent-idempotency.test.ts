import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { seedGroup } from "../support/app.js";
import { concurrentApp } from "../support/concurrent-app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";
import { releaseTogether } from "../support/locks.js";

describe("one Idempotency-Key sent concurrently", () => {
  const seeding = concurrentApp();
  const app = concurrentApp({ autoKey: false });
  afterEach(expectLedgerInvariants);

  it("writes to the ledger exactly once and gives everyone the same response", async () => {
    const { groupId, ids } = await seedGroup(seeding, ["Bruno", "Carla", "Alex"]);
    const key = randomUUID();
    const payload = {
      payerId: ids.Bruno,
      amount: 9000,
      description: "Dinner",
      split: { type: "equal", memberIds: Object.values(ids) },
    };

    // All 20 wait at their insert of the key, then race to claim it.
    const results = await releaseTogether(
      "idempotency_keys",
      Array.from({ length: 20 }, () => () =>
        app.inject({
          method: "POST",
          url: `/groups/${groupId}/expenses`,
          payload,
          headers: { "idempotency-key": key },
        }),
      ),
    );

    expect(results.map((r) => r.statusCode)).toEqual(results.map(() => 201));
    expect(new Set(results.map((r) => r.body)).size).toBe(1);
    expect(results.filter((r) => r.headers["idempotent-replayed"] === "true")).toHaveLength(19);

    const expenses = await db
      .selectFrom("transactions")
      .where("group_id", "=", groupId)
      .where("type", "=", "expense")
      .selectAll()
      .execute();
    expect(expenses).toHaveLength(1);
  });
});

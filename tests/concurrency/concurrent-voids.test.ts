import { afterEach, describe, expect, it } from "vitest";
import { seedGroup } from "../support/app.js";
import { concurrentApp } from "../support/concurrent-app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";
import { releaseTogether } from "../support/locks.js";

describe("voids of the same transaction fired concurrently", () => {
  const app = concurrentApp();
  afterEach(expectLedgerInvariants);

  it("let exactly one succeed", async () => {
    const { groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]);
    const dinner = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 9000,
        description: "Dinner",
        split: { type: "equal", memberIds: Object.values(ids) },
      },
    });
    const dinnerId = dinner.json().id;

    // All 20 pass the "already voided?" check before any of them inserts, so
    // the losers are stopped by the unique reverses_id index, not the check.
    const results = await releaseTogether(
      "transactions",
      Array.from({ length: 20 }, () => () =>
        app.inject({ method: "POST", url: `/transactions/${dinnerId}/void` }),
      ),
    );

    const statuses = results.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    for (const r of results.filter((r) => r.statusCode === 409)) {
      expect(r.json().error.code).toBe("already_voided");
    }

    const reversals = await db
      .selectFrom("transactions")
      .where("reverses_id", "=", dinnerId)
      .selectAll()
      .execute();
    expect(reversals).toHaveLength(1);

    const balances = await app.inject({ method: "GET", url: `/groups/${groupId}/balances` });
    expect(balances.json().members.map((m: { balance: number }) => m.balance)).toEqual([0, 0, 0]);
  });
});

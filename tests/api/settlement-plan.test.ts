import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";

describe("GET /groups/:groupId/settlement-plan", () => {
  const app = testApp();
  afterEach(expectLedgerInvariants);

  const plan = async (groupId: string) => {
    const res = await app.inject({ method: "GET", url: `/groups/${groupId}/settlement-plan` });
    expect(res.statusCode).toBe(200);
    return res.json();
  };

  const balances = async (groupId: string) =>
    (await app.inject({ method: "GET", url: `/groups/${groupId}/balances` }))
      .json()
      .members.map((m: { balance: number }) => m.balance);

  /** A handful of overlapping expenses so the plan has real work to do. */
  const busyGroup = async () => {
    const { groupId, ids } = await seedGroup(app, ["Alex", "Bruno", "Carla", "Dana", "Eve"]);
    const all = Object.values(ids);
    const expenses: Array<[string, number, string[]]> = [
      [ids.Bruno!, 12_000, all],
      [ids.Carla!, 4_500, [ids.Alex!, ids.Carla!, ids.Dana!]],
      [ids.Eve!, 3_001, [ids.Bruno!, ids.Eve!]],
      [ids.Alex!, 999, [ids.Dana!, ids.Eve!, ids.Carla!]],
    ];
    for (const [payerId, amount, memberIds] of expenses) {
      const res = await app.inject({
        method: "POST",
        url: `/groups/${groupId}/expenses`,
        payload: { payerId, amount, description: "Shared", split: { type: "equal", memberIds } },
      });
      expect(res.statusCode).toBe(201);
    }
    return { groupId, ids };
  };

  it("brings every balance to exactly zero when recorded as settlements", async () => {
    const { groupId } = await busyGroup();
    const { payments } = await plan(groupId);

    expect(payments.length).toBeGreaterThan(0);
    expect(payments.length).toBeLessThanOrEqual(4);
    for (const payment of payments) {
      const res = await app.inject({
        method: "POST",
        url: `/groups/${groupId}/settlements`,
        payload: payment,
      });
      expect(res.statusCode).toBe(201);
    }

    expect(await balances(groupId)).toEqual([0, 0, 0, 0, 0]);
    expect((await plan(groupId)).payments).toEqual([]);
  });

  it("is read-only and deterministic", async () => {
    const { groupId } = await busyGroup();
    const transactions = async () => (await db.selectFrom("transactions").selectAll().execute()).length;
    const before = await transactions();

    const first = await plan(groupId);
    const second = await plan(groupId);

    expect(second).toEqual(first);
    expect(await transactions()).toBe(before);
  });

  it("describes itself as advice", async () => {
    const { groupId } = await seedGroup(app, ["Bruno"]);
    expect(await plan(groupId)).toEqual({
      groupId,
      currency: "EUR",
      note: expect.stringMatching(/nothing is recorded/),
      payments: [],
    });
  });

  it("returns 404 for an unknown group", async () => {
    const res = await app.inject({ method: "GET", url: `/groups/${randomUUID()}/settlement-plan` });
    expect(res.statusCode).toBe(404);
  });
});

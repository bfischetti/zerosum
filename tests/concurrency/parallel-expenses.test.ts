import { afterEach, describe, expect, it } from "vitest";
import { computeShares, type Split } from "../../src/expenses/split.js";
import { seedGroup } from "../support/app.js";
import { concurrentApp } from "../support/concurrent-app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";
import { releaseTogether } from "../support/locks.js";

describe("expenses posted in parallel", () => {
  const app = concurrentApp();
  afterEach(expectLedgerInvariants);

  const setup = async () => {
    const { groupId, ids } = await seedGroup(app, ["Alex", "Bruno", "Carla", "Dana"]);
    const members = Object.values(ids);
    // Deterministic but varied: rotating payers, equal splits with remainders.
    const expenses = Array.from({ length: 30 }, (_, i) => ({
      payerId: members[i % members.length]!,
      amount: 1_000 + i * 37,
      description: `parallel ${i}`,
      split: { type: "equal", memberIds: members.slice(0, 2 + (i % 3)) } as Split,
    }));
    const expected = new Map(members.map((id) => [id, 0]));
    for (const e of expenses) {
      expected.set(e.payerId, expected.get(e.payerId)! + e.amount);
      for (const s of computeShares(e.amount, e.split)) {
        expected.set(s.memberId, expected.get(s.memberId)! - s.amount);
      }
    }
    const post = (payload: object) => () =>
      app.inject({ method: "POST", url: `/groups/${groupId}/expenses`, payload });
    return { groupId, expenses, expected, post };
  };

  const assertOutcome = async (groupId: string, expected: Map<string, number>, n: number) => {
    const count = await db
      .selectFrom("transactions")
      .where("group_id", "=", groupId)
      .where("type", "=", "expense")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(n);

    const res = await app.inject({ method: "GET", url: `/groups/${groupId}/balances` });
    const actual = new Map(
      res.json().members.map((m: { memberId: string; balance: number }) => [m.memberId, m.balance]),
    );
    expect(actual).toEqual(expected);
  };

  it("all land, each balanced, when released from the same starting point", async () => {
    const { groupId, expenses, expected, post } = await setup();

    // Each request reads the accounts, then waits at its insert into
    // transactions until all 30 are waiting there together.
    const results = await releaseTogether("transactions", expenses.map(post));

    expect(results.map((r) => r.statusCode)).toEqual(expenses.map(() => 201));
    await assertOutcome(groupId, expected, expenses.length);
  });

  it("all land under an unsynchronised burst", async () => {
    const { groupId, expenses, expected, post } = await setup();

    const results = await Promise.all(expenses.map((e) => post(e)()));

    expect(results.map((r) => r.statusCode)).toEqual(expenses.map(() => 201));
    await assertOutcome(groupId, expected, expenses.length);
  });
});

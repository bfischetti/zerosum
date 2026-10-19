import { describe, expect, it } from "vitest";
import { planSettlements, type PlannedPayment } from "../../src/settlements/plan.js";

const balancesOf = (entries: Record<string, number>) =>
  Object.entries(entries).map(([memberId, balance]) => ({ memberId, balance }));

/** Applies the plan as settlements: the sender's balance rises, the receiver's falls. */
function apply(entries: Record<string, number>, plan: PlannedPayment[]) {
  const after = { ...entries };
  for (const p of plan) {
    after[p.fromMemberId]! += p.amount;
    after[p.toMemberId]! -= p.amount;
  }
  return after;
}

const allZero = (entries: Record<string, number>) =>
  Object.fromEntries(Object.keys(entries).map((k) => [k, 0]));

describe("planSettlements", () => {
  it("is empty when everyone is settled", () => {
    expect(planSettlements(balancesOf({ a: 0, b: 0 }))).toEqual([]);
    expect(planSettlements([])).toEqual([]);
  });

  it("has debtors pay creditors", () => {
    expect(planSettlements(balancesOf({ bruno: 6000, carla: -3000, alex: -3000 }))).toEqual([
      { fromMemberId: "alex", toMemberId: "bruno", amount: 3000 },
      { fromMemberId: "carla", toMemberId: "bruno", amount: 3000 },
    ]);
  });

  it("settles exact-match pairs first, beating plain greedy", () => {
    // Plain greedy needs 4 payments here; pairing -5 with +5 first needs 3.
    const balances = { a: -6, b: -5, c: 2, d: 4, e: 5 };
    const plan = planSettlements(balancesOf(balances));

    expect(plan).toContainEqual({ fromMemberId: "b", toMemberId: "e", amount: 5 });
    expect(plan).toHaveLength(3);
    expect(apply(balances, plan)).toEqual(allZero(balances));
  });

  it("is deterministic regardless of input order", () => {
    const balances = { a: -700, b: -300, c: 400, d: 400, e: 200 };
    const forward = planSettlements(balancesOf(balances));
    const backward = planSettlements(balancesOf(balances).reverse());
    expect(backward).toEqual(forward);
  });

  it("refuses balances that don't sum to zero", () => {
    expect(() => planSettlements(balancesOf({ a: 1, b: -2 }))).toThrow(/sum to -1/);
  });

  it("zeroes everyone in at most n - 1 payments, for many random groups", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };

    for (let round = 0; round < 500; round++) {
      const n = 2 + Math.floor(random() * 9);
      const entries: Record<string, number> = {};
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const balance = Math.floor(random() * 20_001) - 10_000;
        entries[`m${i}`] = balance;
        sum += balance;
      }
      entries[`m${n - 1}`] = 0 - sum; // not -sum, which is -0 when sum is 0

      const plan = planSettlements(balancesOf(entries));

      expect(apply(entries, plan)).toEqual(allZero(entries));
      expect(plan.length).toBeLessThanOrEqual(n - 1);
      for (const p of plan) expect(p.amount).toBeGreaterThan(0);
    }
  });
});

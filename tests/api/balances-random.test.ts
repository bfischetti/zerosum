import { describe, expect, it } from "vitest";
import { computeShares, type Split } from "../../src/expenses/split.js";
import { seedGroup, testApp } from "../support/app.js";
import { expectLedgerInvariants } from "../support/invariants.js";

/** Small deterministic PRNG (mulberry32) so a failure is reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("balances under many random expenses", () => {
  const app = testApp();

  it.each([1, 2, 3])("match the expected totals and sum to zero (seed %i)", async (seed) => {
    const random = rng(seed);
    const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)]!;
    const names = ["Alex", "Bruno", "Carla", "Dana", "Eve"];
    const { groupId, ids } = await seedGroup(app, names);
    const memberIds = Object.values(ids);
    const expected = new Map(memberIds.map((id) => [id, 0]));

    for (let i = 0; i < 40; i++) {
      const payerId = pick(memberIds);
      const participants = memberIds.filter(() => random() < 0.6);
      if (participants.length === 0 || (participants.length === 1 && participants[0] === payerId)) {
        continue;
      }
      const amount = participants.length + Math.floor(random() * 20_000);
      let split: Split;
      if (random() < 0.5) {
        split = { type: "equal", memberIds: participants };
      } else {
        // Random positive exact shares summing to the amount.
        let left = amount;
        const shares = participants.map((memberId, j) => {
          const room = left - (participants.length - j - 1);
          const share = j === participants.length - 1 ? left : 1 + Math.floor(random() * (room - 1));
          left -= share;
          return { memberId, amount: share };
        });
        split = { type: "exact", shares };
      }

      const res = await app.inject({
        method: "POST",
        url: `/groups/${groupId}/expenses`,
        payload: { payerId, amount, description: `expense ${i}`, split },
      });
      expect(res.statusCode, res.body).toBe(201);

      expected.set(payerId, expected.get(payerId)! + amount);
      for (const s of computeShares(amount, split)) {
        expected.set(s.memberId, expected.get(s.memberId)! - s.amount);
      }
    }

    const res = await app.inject({ method: "GET", url: `/groups/${groupId}/balances` });
    const actual = new Map(
      res.json().members.map((m: { memberId: string; balance: number }) => [m.memberId, m.balance]),
    );
    expect(actual).toEqual(expected);
    await expectLedgerInvariants();
  });
});

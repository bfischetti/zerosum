import { describe, expect, it } from "vitest";
import { computeShares, netExpense } from "../../src/expenses/split.js";

const [A, B, C] = [
  "00000000-0000-4000-8000-00000000000a",
  "00000000-0000-4000-8000-00000000000b",
  "00000000-0000-4000-8000-00000000000c",
];

describe("computeShares: equal", () => {
  it("splits evenly when there is no remainder", () => {
    expect(computeShares(9000, { type: "equal", memberIds: [A, B, C] })).toEqual([
      { memberId: A, amount: 3000 },
      { memberId: B, amount: 3000 },
      { memberId: C, amount: 3000 },
    ]);
  });

  it("gives remainder cents to participants in member-id order", () => {
    expect(computeShares(1000, { type: "equal", memberIds: [C, A, B] })).toEqual([
      { memberId: A, amount: 334 },
      { memberId: B, amount: 333 },
      { memberId: C, amount: 333 },
    ]);
    expect(computeShares(1001, { type: "equal", memberIds: [B, C, A] })).toEqual([
      { memberId: A, amount: 334 },
      { memberId: B, amount: 334 },
      { memberId: C, amount: 333 },
    ]);
  });

  it("is independent of the order participants are listed in", () => {
    const one = computeShares(1000, { type: "equal", memberIds: [A, B, C] });
    const other = computeShares(1000, { type: "equal", memberIds: [C, B, A] });
    expect(one).toEqual(other);
  });

  it("allows exactly one cent each", () => {
    expect(computeShares(3, { type: "equal", memberIds: [A, B, C] }).map((s) => s.amount)).toEqual([
      1, 1, 1,
    ]);
  });

  it("rejects an amount that would leave someone a zero share", () => {
    expect(() => computeShares(2, { type: "equal", memberIds: [A, B, C] })).toThrow(
      expect.objectContaining({ statusCode: 422, code: "amount_too_small" }),
    );
  });
});

describe("computeShares: exact", () => {
  it("returns the given shares when they sum to the amount", () => {
    const shares = [
      { memberId: A, amount: 700 },
      { memberId: B, amount: 300 },
    ];
    expect(computeShares(1000, { type: "exact", shares })).toEqual(shares);
  });

  it("rejects shares that do not sum to the amount", () => {
    expect(() =>
      computeShares(1000, {
        type: "exact",
        shares: [
          { memberId: A, amount: 700 },
          { memberId: B, amount: 299 },
        ],
      }),
    ).toThrow(expect.objectContaining({ statusCode: 422, code: "split_mismatch" }));
  });
});

describe("netExpense", () => {
  it("nets the payer's own share into one entry", () => {
    const shares = computeShares(9000, { type: "equal", memberIds: [A, B, C] });
    expect(Object.fromEntries(netExpense(A, 9000, shares))).toEqual({
      [A]: -6000,
      [B]: 3000,
      [C]: 3000,
    });
  });

  it("credits the full amount when the payer is not a participant", () => {
    const shares = computeShares(6000, { type: "equal", memberIds: [B, C] });
    expect(Object.fromEntries(netExpense(A, 6000, shares))).toEqual({
      [A]: -6000,
      [B]: 3000,
      [C]: 3000,
    });
  });

  it("always nets to zero", () => {
    const shares = computeShares(1001, { type: "equal", memberIds: [A, B, C] });
    const total = [...netExpense(B, 1001, shares).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("rejects an expense whose only participant is the payer", () => {
    const shares = computeShares(3000, { type: "equal", memberIds: [A] });
    expect(() => netExpense(A, 3000, shares)).toThrow(
      expect.objectContaining({ statusCode: 422, code: "payer_only_participant" }),
    );
  });
});

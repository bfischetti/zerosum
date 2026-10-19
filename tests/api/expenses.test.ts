import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testApp, seedGroup } from "../support/app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";

describe("POST /groups/:groupId/expenses", () => {
  const app = testApp();
  afterEach(expectLedgerInvariants);
  let groupId: string;
  let ids: Record<string, string>;

  beforeEach(async () => {
    ({ groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]));
  });

  const post = (payload: object, group = groupId) =>
    app.inject({ method: "POST", url: `/groups/${group}/expenses`, payload });

  /** Entry amounts by member name, read straight from the ledger. */
  const entriesByName = async () => {
    const rows = await db
      .selectFrom("entries")
      .innerJoin("accounts", "accounts.id", "entries.account_id")
      .select(["accounts.member_id", "entries.amount"])
      .execute();
    const nameOf = Object.fromEntries(Object.entries(ids).map(([n, id]) => [id, n]));
    return Object.fromEntries(rows.map((r) => [nameOf[r.member_id], r.amount]));
  };

  const ledgerIsEmpty = async () =>
    (await db.selectFrom("transactions").selectAll().execute()).length === 0;

  it("records an equal split with the payer's share netted", async () => {
    const res = await post({
      payerId: ids.Bruno,
      amount: 9000,
      description: "Dinner",
      split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      groupId,
      type: "expense",
      description: "Dinner",
      amount: 9000,
      payerId: ids.Bruno,
    });
    expect(await entriesByName()).toEqual({ Bruno: -6000, Carla: 3000, Alex: 3000 });
    const tx = await db.selectFrom("transactions").select("amount").executeTakeFirstOrThrow();
    expect(tx.amount).toBe(9000);
  });

  it("gives remainder cents to participants in member-id order", async () => {
    const res = await post({
      payerId: ids.Bruno,
      amount: 1000,
      description: "Taxi",
      split: { type: "equal", memberIds: [ids.Alex, ids.Carla, ids.Bruno] },
    });

    expect(res.statusCode).toBe(201);
    const sorted = Object.values(ids).sort();
    expect(res.json().shares).toEqual([
      { memberId: sorted[0], amount: 334 },
      { memberId: sorted[1], amount: 333 },
      { memberId: sorted[2], amount: 333 },
    ]);
  });

  it("records an exact split", async () => {
    const res = await post({
      payerId: ids.Carla,
      amount: 5000,
      description: "Groceries",
      split: {
        type: "exact",
        shares: [
          { memberId: ids.Bruno, amount: 1500 },
          { memberId: ids.Carla, amount: 2000 },
          { memberId: ids.Alex, amount: 1500 },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(await entriesByName()).toEqual({ Bruno: 1500, Carla: -3000, Alex: 1500 });
  });

  it("allows a payer who is not a participant", async () => {
    const res = await post({
      payerId: ids.Bruno,
      amount: 6000,
      description: "Gift",
      split: { type: "equal", memberIds: [ids.Carla, ids.Alex] },
    });

    expect(res.statusCode).toBe(201);
    expect(await entriesByName()).toEqual({ Bruno: -6000, Carla: 3000, Alex: 3000 });
  });

  it("keeps a past occurredAt", async () => {
    const res = await post({
      payerId: ids.Bruno,
      amount: 900,
      description: "Coffee",
      occurredAt: "2026-01-02T10:00:00+01:00",
      split: { type: "equal", memberIds: [ids.Carla] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().occurredAt).toBe("2026-01-02T09:00:00.000Z");
  });

  describe("rejections leave the ledger untouched", () => {
    const expense = (overrides: object = {}) => ({
      payerId: ids.Bruno,
      amount: 9000,
      description: "Dinner",
      split: { type: "equal", memberIds: [ids.Bruno, ids.Carla] },
      ...overrides,
    });

    it.each([
      ["a fractional amount", () => expense({ amount: 10.5 }), "amount"],
      ["a negative amount", () => expense({ amount: -100 }), "amount"],
      ["a missing description", () => expense({ description: undefined }), "description"],
      ["an unknown split type", () => expense({ split: { type: "percent" } }), "split.type"],
      [
        "duplicate participants",
        () => expense({ split: { type: "equal", memberIds: [ids.Carla, ids.Carla] } }),
        "split.memberIds",
      ],
      [
        "a zero exact share",
        () =>
          expense({
            amount: 100,
            split: { type: "exact", shares: [{ memberId: ids.Carla, amount: 0 }] },
          }),
        "split.shares.0.amount",
      ],
      ["an occurredAt without offset", () => expense({ occurredAt: "2026-01-02T10:00:00" }), "occurredAt"],
    ])("400 for %s", async (_, body, path) => {
      const res = await post(body());
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details.map((d: { path: string }) => d.path)).toContain(path);
      expect(await ledgerIsEmpty()).toBe(true);
    });

    it.each([
      [
        "exact shares that don't sum to the amount",
        () =>
          expense({
            amount: 1000,
            split: { type: "exact", shares: [{ memberId: ids.Carla, amount: 999 }] },
          }),
        "split_mismatch",
      ],
      [
        "an equal split that would leave a zero share",
        () => expense({ amount: 2, split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] } }),
        "amount_too_small",
      ],
      [
        "the payer as the only participant",
        () => expense({ split: { type: "equal", memberIds: [ids.Bruno] } }),
        "payer_only_participant",
      ],
      [
        "a participant outside the group",
        () => expense({ split: { type: "equal", memberIds: [ids.Carla, randomUUID()] } }),
        "not_a_member",
      ],
      ["a payer outside the group", () => expense({ payerId: randomUUID() }), "not_a_member"],
      [
        "a future occurredAt",
        () => expense({ occurredAt: new Date(Date.now() + 3_600_000).toISOString() }),
        "occurred_in_future",
      ],
    ])("422 for %s", async (_, body, code) => {
      const res = await post(body());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe(code);
      expect(await ledgerIsEmpty()).toBe(true);
    });

    it("404 for an unknown group", async () => {
      const res = await post(expense(), randomUUID());
      expect(res.statusCode).toBe(404);
      expect(await ledgerIsEmpty()).toBe(true);
    });
  });
});

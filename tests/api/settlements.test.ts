import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";

describe("POST /groups/:groupId/settlements", () => {
  const app = testApp();
  afterEach(expectLedgerInvariants);

  let groupId: string;
  let ids: Record<string, string>;

  beforeEach(async () => {
    ({ groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]));
    // Bruno pays 9000 for dinner: Bruno +6000, Carla -3000, Alex -3000.
    const res = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 9000,
        description: "Dinner",
        split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
      },
    });
    expect(res.statusCode).toBe(201);
  });

  const settle = (payload: object, group = groupId) =>
    app.inject({ method: "POST", url: `/groups/${group}/settlements`, payload });

  const balanceOf = async () => {
    const res = await app.inject({ method: "GET", url: `/groups/${groupId}/balances` });
    return Object.fromEntries(
      res.json().members.map((m: { name: string; balance: number; sent: number; received: number }) => [
        m.name,
        { balance: m.balance, sent: m.sent, received: m.received },
      ]),
    );
  };

  const settlementCount = async () =>
    (await db.selectFrom("transactions").where("type", "=", "settlement").selectAll().execute())
      .length;

  it("records a payment and moves both balances", async () => {
    const res = await settle({ fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 3000 });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      groupId,
      type: "settlement",
      description: null,
      amount: 3000,
      fromMemberId: ids.Carla,
      toMemberId: ids.Bruno,
      occurredAt: expect.any(String),
      recordedAt: expect.any(String),
    });
    expect(await balanceOf()).toEqual({
      Alex: { balance: -3000, sent: 0, received: 0 },
      Bruno: { balance: 3000, sent: 0, received: 3000 },
      Carla: { balance: 0, sent: 3000, received: 0 },
    });
  });

  it("accepts more than was owed", async () => {
    const res = await settle({ fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 5000 });

    expect(res.statusCode).toBe(201);
    const balances = await balanceOf();
    expect(balances.Carla.balance).toBe(2000);
    expect(balances.Bruno.balance).toBe(1000);
  });

  it("accepts a payment between two debtors", async () => {
    const res = await settle({ fromMemberId: ids.Alex, toMemberId: ids.Carla, amount: 1000 });

    expect(res.statusCode).toBe(201);
    const balances = await balanceOf();
    expect(balances.Alex.balance).toBe(-2000);
    expect(balances.Carla.balance).toBe(-4000);
  });

  it("keeps an optional description and past occurredAt", async () => {
    const res = await settle({
      fromMemberId: ids.Carla,
      toMemberId: ids.Bruno,
      amount: 3000,
      description: "Bank transfer",
      occurredAt: "2026-03-01T12:00:00Z",
    });

    expect(res.json()).toMatchObject({
      description: "Bank transfer",
      occurredAt: "2026-03-01T12:00:00.000Z",
    });
  });

  describe("rejections leave the ledger untouched", () => {
    it.each([
      ["paying oneself", () => ({ fromMemberId: ids.Carla, toMemberId: ids.Carla, amount: 100 }), "toMemberId"],
      ["a zero amount", () => ({ fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 0 }), "amount"],
      ["a fractional amount", () => ({ fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 1.5 }), "amount"],
      ["a malformed member id", () => ({ fromMemberId: "carla", toMemberId: ids.Bruno, amount: 100 }), "fromMemberId"],
    ])("400 for %s", async (_, body, path) => {
      const res = await settle(body());
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details.map((d: { path: string }) => d.path)).toContain(path);
      expect(await settlementCount()).toBe(0);
    });

    it.each([
      ["a sender outside the group", () => ({ fromMemberId: randomUUID(), toMemberId: ids.Bruno, amount: 100 }), "not_a_member"],
      ["a receiver outside the group", () => ({ fromMemberId: ids.Carla, toMemberId: randomUUID(), amount: 100 }), "not_a_member"],
      [
        "a future occurredAt",
        () => ({
          fromMemberId: ids.Carla,
          toMemberId: ids.Bruno,
          amount: 100,
          occurredAt: new Date(Date.now() + 3_600_000).toISOString(),
        }),
        "occurred_in_future",
      ],
    ])("422 for %s", async (_, body, code) => {
      const res = await settle(body());
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe(code);
      expect(await settlementCount()).toBe(0);
    });

    it("404 for an unknown group", async () => {
      const res = await settle(
        { fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 100 },
        randomUUID(),
      );
      expect(res.statusCode).toBe(404);
      expect(await settlementCount()).toBe(0);
    });
  });
});

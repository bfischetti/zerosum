import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";
import { testDb as db } from "../support/db.js";
import { expectLedgerInvariants } from "../support/invariants.js";
import { waitForLockWait } from "../support/locks.js";

describe("POST /transactions/:id/void", () => {
  const app = testApp();
  afterEach(expectLedgerInvariants);

  let groupId: string;
  let ids: Record<string, string>;
  let dinnerId: string;

  beforeEach(async () => {
    ({ groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]));
    const res = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 9000,
        description: "Dinner",
        occurredAt: "2026-01-02T20:00:00Z",
        split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
      },
    });
    dinnerId = res.json().id;
  });

  const voidTx = (id: string, payload?: object) =>
    app.inject({ method: "POST", url: `/transactions/${id}/void`, ...(payload && { payload }) });

  const balances = async () => {
    const res = await app.inject({ method: "GET", url: `/groups/${groupId}/balances` });
    return Object.fromEntries(
      res.json().members.map((m: { name: string; balance: number }) => [m.name, m.balance]),
    );
  };

  const entriesOf = async (transactionId: string) =>
    Object.fromEntries(
      (
        await db
          .selectFrom("entries")
          .select(["account_id", "amount"])
          .where("transaction_id", "=", transactionId)
          .execute()
      ).map((e) => [e.account_id, e.amount]),
    );

  it("posts a reversal that cancels the expense", async () => {
    const res = await voidTx(dinnerId, { description: "Entered twice" });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      groupId,
      type: "reversal",
      reversesId: dinnerId,
      description: "Entered twice",
      amount: 9000,
      occurredAt: expect.any(String),
      recordedAt: expect.any(String),
    });
    expect(await balances()).toEqual({ Alex: 0, Bruno: 0, Carla: 0 });
  });

  it("mirrors every entry of the original with the sign flipped", async () => {
    const res = await voidTx(dinnerId);

    const original = await entriesOf(dinnerId);
    const mirrored = Object.fromEntries(Object.entries(original).map(([k, v]) => [k, -v]));
    expect(await entriesOf(res.json().id)).toEqual(mirrored);
  });

  it("occurs at the moment of voiding, not at the original's date", async () => {
    const before = Date.now();
    const res = await voidTx(dinnerId);
    expect(new Date(res.json().occurredAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("voids a settlement", async () => {
    const settlement = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/settlements`,
      payload: { fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 3000 },
    });

    const res = await voidTx(settlement.json().id);

    expect(res.statusCode).toBe(201);
    expect(await balances()).toEqual({ Alex: -3000, Bruno: 6000, Carla: -3000 });
  });

  it("rejects voiding twice with 409", async () => {
    await voidTx(dinnerId);
    const res = await voidTx(dinnerId);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("already_voided");
  });

  it("rejects voiding a reversal with 422", async () => {
    const reversal = await voidTx(dinnerId);
    const res = await voidTx(reversal.json().id);

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("reversal_not_voidable");
  });

  it("returns 409 when it loses the race on the unique index", async () => {
    // Deterministic version of the race: another DB transaction holds an
    // uncommitted reversal, so the API's pre-check sees nothing and its insert
    // blocks on the unique reverses_id index until the holder commits.
    let apiVoid!: ReturnType<typeof voidTx>;
    await db.transaction().execute(async (trx) => {
      const holder = await trx
        .insertInto("transactions")
        .values({ group_id: groupId, type: "reversal", reverses_id: dinnerId, amount: 9000 })
        .returning("id")
        .executeTakeFirstOrThrow();
      const original = await trx
        .selectFrom("entries")
        .select(["account_id", "amount"])
        .where("transaction_id", "=", dinnerId)
        .execute();
      await trx
        .insertInto("entries")
        .values(
          original.map((e) => ({
            transaction_id: holder.id,
            group_id: groupId,
            account_id: e.account_id,
            amount: -e.amount,
          })),
        )
        .execute();

      apiVoid = voidTx(dinnerId);
      await waitForLockWait();
    });

    const res = await apiVoid;
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("already_voided");
  });

  it("returns 404 for an unknown transaction", async () => {
    const res = await voidTx(randomUUID());
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await voidTx("nope");
    expect(res.statusCode).toBe(400);
  });
});

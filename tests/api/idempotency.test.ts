import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";
import { hashRequest } from "../../src/http/idempotency.js";
import { testDb as db } from "../support/db.js";
import { waitForLockWait } from "../support/locks.js";

describe("Idempotency-Key on write endpoints", () => {
  // seedGroup posts through this app too, so it needs keys added for it.
  const seeding = testApp();
  const app = testApp({ autoKey: false });

  let groupId: string;
  let ids: Record<string, string>;

  beforeEach(async () => {
    ({ groupId, ids } = await seedGroup(seeding, ["Bruno", "Carla", "Alex"]));
  });

  const dinner = () => ({
    payerId: ids.Bruno,
    amount: 9000,
    description: "Dinner",
    split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
  });

  const postExpense = (key: string | undefined, payload: object = dinner(), group = groupId) =>
    app.inject({
      method: "POST",
      url: `/groups/${group}/expenses`,
      payload,
      headers: key === undefined ? {} : { "idempotency-key": key },
    });

  const expenseCount = async () =>
    (await db.selectFrom("transactions").where("type", "=", "expense").selectAll().execute())
      .length;

  it.each([
    ["POST /members", () => ({ url: "/members", payload: { name: "Dana" } })],
    ["POST /groups", () => ({ url: "/groups", payload: { name: "Flat" } })],
    [
      "POST /groups/:groupId/members",
      () => ({ url: `/groups/${groupId}/members`, payload: { memberId: randomUUID() } }),
    ],
    ["POST /groups/:groupId/expenses", () => ({ url: `/groups/${groupId}/expenses`, payload: dinner() })],
    [
      "POST /groups/:groupId/settlements",
      () => ({
        url: `/groups/${groupId}/settlements`,
        payload: { fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 100 },
      }),
    ],
    ["POST /transactions/:id/void", () => ({ url: `/transactions/${randomUUID()}/void` })],
  ])("%s requires the header", async (_, request) => {
    const res = await app.inject({ method: "POST", ...request() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("missing_idempotency_key");
  });

  it("rejects a key longer than 255 characters", async () => {
    const res = await postExpense("k".repeat(256));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_idempotency_key");
  });

  it("replays the stored response for the same key and request", async () => {
    const key = randomUUID();
    const first = await postExpense(key);
    const second = await postExpense(key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    // Byte-identical, not just deep-equal: jsonb storage once re-ordered keys.
    expect(second.body).toBe(first.body);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(await expenseCount()).toBe(1);
  });

  it("treats the same body with keys in another order as the same request", async () => {
    const key = randomUUID();
    const { split, ...rest } = dinner();
    await postExpense(key, { split, ...rest });
    const res = await postExpense(key, Object.fromEntries(Object.entries(dinner()).reverse()));

    expect(res.statusCode).toBe(201);
    expect(res.headers["idempotent-replayed"]).toBe("true");
    expect(await expenseCount()).toBe(1);
  });

  it("rejects the same key with a different body", async () => {
    const key = randomUUID();
    await postExpense(key);
    const res = await postExpense(key, { ...dinner(), amount: 9001 });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("idempotency_key_reused");
    expect(await expenseCount()).toBe(1);
  });

  it("rejects the same key and body sent to a different path", async () => {
    const key = randomUUID();
    await postExpense(key);
    const res = await postExpense(key, dinner(), randomUUID());

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("idempotency_key_reused");
  });

  it("does not store a rejected request, so it can be retried with the same key", async () => {
    const key = randomUUID();
    const rejected = await postExpense(key, { ...dinner(), payerId: randomUUID() });
    expect(rejected.statusCode).toBe(422);
    expect(
      await db.selectFrom("idempotency_keys").where("key", "=", key).selectAll().execute(),
    ).toEqual([]);

    const fixed = await postExpense(key);
    expect(fixed.statusCode).toBe(201);
    expect(await expenseCount()).toBe(1);
  });

  it("writes once when the same key arrives concurrently", async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => postExpense(key)));

    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.json().id)).size).toBe(1);
    expect(await expenseCount()).toBe(1);
  });

  describe("a duplicate waiting on an in-flight request", () => {
    // Deterministic version of the race: an open DB transaction holds the
    // key's row, exactly as an in-flight first request would.
    const holdKey = async (key: string, outcome: "commit" | "rollback") => {
      const hash = hashRequest("POST", `/groups/${groupId}/expenses`, dinner());
      let waiter!: ReturnType<typeof postExpense>;
      await db
        .transaction()
        .execute(async (trx) => {
          await trx
            .insertInto("idempotency_keys")
            .values({
              key,
              request_hash: hash,
              response_status: 201,
              response_body: JSON.stringify({ from: "holder" }),
            })
            .execute();
          waiter = postExpense(key);
          await waitForLockWait();
          if (outcome === "rollback") throw new Error("roll back the holder");
        })
        .catch((err: Error) => {
          if (err.message !== "roll back the holder") throw err;
        });
      return waiter;
    };

    it("replays the holder's response once it commits", async () => {
      const res = await holdKey(randomUUID(), "commit");

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ from: "holder" });
      expect(res.headers["idempotent-replayed"]).toBe("true");
      expect(await expenseCount()).toBe(0);
    });

    it("goes ahead itself once the holder rolls back", async () => {
      const res = await holdKey(randomUUID(), "rollback");

      expect(res.statusCode).toBe(201);
      expect(res.headers["idempotent-replayed"]).toBeUndefined();
      expect(await expenseCount()).toBe(1);
    });
  });
});

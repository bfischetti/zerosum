import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";
import { testDb as db } from "../support/db.js";

describe("GET /groups/:groupId/transactions", () => {
  const app = testApp();
  let groupId: string;
  let ids: Record<string, string>;

  beforeEach(async () => {
    ({ groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]));
  });

  const expense = (description: string, occurredAt?: string) =>
    app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 9000,
        description,
        ...(occurredAt && { occurredAt }),
        split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
      },
    });

  const history = (query = "") =>
    app.inject({ method: "GET", url: `/groups/${groupId}/transactions${query}` });

  it("lists a transaction with its balance changes", async () => {
    const dinner = (await expense("Dinner")).json();

    const res = await history();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        {
          id: dinner.id,
          type: "expense",
          description: "Dinner",
          amount: 9000,
          occurredAt: dinner.occurredAt,
          recordedAt: dinner.recordedAt,
          reversesId: null,
          voidedById: null,
          balanceChanges: expect.arrayContaining([
            { memberId: ids.Bruno, amount: 6000 },
            { memberId: ids.Carla, amount: -3000 },
            { memberId: ids.Alex, amount: -3000 },
          ]),
        },
      ],
      nextCursor: null,
    });
  });

  it("orders newest first by occurredAt, so a backdated expense sorts back", async () => {
    await expense("Tuesday", "2026-01-06T20:00:00Z");
    await expense("Thursday", "2026-01-08T20:00:00Z");
    await expense("Wednesday, entered late", "2026-01-07T20:00:00Z");

    const items = (await history()).json().items;
    expect(items.map((i: { description: string }) => i.description)).toEqual([
      "Thursday",
      "Wednesday, entered late",
      "Tuesday",
    ]);
  });

  it("shows a voided original and its reversal, linked both ways", async () => {
    const dinner = (await expense("Dinner", "2026-01-06T20:00:00Z")).json();
    const reversal = (
      await app.inject({ method: "POST", url: `/transactions/${dinner.id}/void` })
    ).json();

    const items = (await history()).json().items;
    expect(items).toMatchObject([
      { id: reversal.id, type: "reversal", reversesId: dinner.id, voidedById: null, amount: 9000 },
      { id: dinner.id, type: "expense", reversesId: null, voidedById: reversal.id },
    ]);
  });

  it("pages through every transaction exactly once", async () => {
    for (let i = 0; i < 7; i++) await expense(`e${i}`, `2026-01-0${i + 1}T12:00:00Z`);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await history(`?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      seen.push(...body.items.map((i: { description: string }) => i.description));
      cursor = body.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(["e6", "e5", "e4", "e3", "e2", "e1", "e0"]);
  });

  it("pages correctly through rows with identical timestamps", async () => {
    // Inserted in one DB transaction, so all four share recorded_at = now()
    // to the microsecond and only the id breaks the tie. A cursor that lost
    // the microseconds (a JS Date) would skip the rest of the rows here.
    const accounts = await db
      .selectFrom("accounts")
      .select(["id", "member_id"])
      .where("group_id", "=", groupId)
      .execute();
    const accountOf = (memberId: string) => accounts.find((a) => a.member_id === memberId)!.id;
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < 4; i++) {
        const tx = await trx
          .insertInto("transactions")
          .values({
            group_id: groupId,
            type: "expense",
            description: `same ${i}`,
            amount: 100,
            occurred_at: "2026-01-01T12:00:00Z",
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("entries")
          .values([
            { transaction_id: tx.id, group_id: groupId, account_id: accountOf(ids.Bruno!), amount: -100 },
            { transaction_id: tx.id, group_id: groupId, account_id: accountOf(ids.Carla!), amount: 100 },
          ])
          .execute();
      }
    });
    const stamps = await sql<{ recorded_at: string }>`
      select distinct recorded_at::text from transactions
    `.execute(db);
    expect(stamps.rows).toHaveLength(1);

    const first = (await history("?limit=2")).json();
    const second = (await history(`?limit=2&cursor=${first.nextCursor}`)).json();
    const all = [...first.items, ...second.items].map((i: { id: string }) => i.id);
    expect(new Set(all).size).toBe(4);
    expect(second.nextCursor).toBeNull();
  });

  it.each([
    ["a limit above 200", "?limit=201"],
    ["a zero limit", "?limit=0"],
    ["a malformed cursor", "?cursor=bm9wZQ"],
  ])("returns 400 for %s", async (_, query) => {
    const res = await history(query);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown group", async () => {
    const res = await app.inject({ method: "GET", url: `/groups/${randomUUID()}/transactions` });
    expect(res.statusCode).toBe(404);
  });
});

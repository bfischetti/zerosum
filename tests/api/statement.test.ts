import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";

describe("GET /groups/:groupId/members/:memberId/statement", () => {
  const app = testApp();
  let groupId: string;
  let ids: Record<string, string>;

  beforeEach(async () => {
    ({ groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]));
  });

  const post = async (url: string, payload?: object) => {
    const res = await app.inject({ method: "POST", url, ...(payload && { payload }) });
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  };

  const dinner = (occurredAt: string, amount = 9000) =>
    post(`/groups/${groupId}/expenses`, {
      payerId: ids.Bruno,
      amount,
      description: "Dinner",
      occurredAt,
      split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
    });

  const statement = (memberId: string, query = "") =>
    app.inject({
      method: "GET",
      url: `/groups/${groupId}/members/${memberId}/statement${query}`,
    });

  const lines = async (memberId: string) =>
    (await statement(memberId)).json().items.map((l: { type: string; change: number; balance: number }) => [
      l.type,
      l.change,
      l.balance,
    ]);

  it("lists every entry oldest first with a running balance", async () => {
    const d = await dinner("2026-01-02T20:00:00Z");
    await post(`/groups/${groupId}/settlements`, {
      fromMemberId: ids.Carla,
      toMemberId: ids.Bruno,
      amount: 3000,
      occurredAt: "2026-01-03T09:00:00Z",
    });
    await post(`/transactions/${d.id}/void`);

    const res = await statement(ids.Bruno!);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ groupId, memberId: ids.Bruno, nextCursor: null });
    expect(res.json().items[2]).toMatchObject({ reversesId: d.id });
    expect(await lines(ids.Bruno!)).toEqual([
      ["expense", 6000, 6000],
      ["settlement", -3000, 3000],
      ["reversal", -6000, -3000],
    ]);
  });

  it("ends at the member's balance", async () => {
    await dinner("2026-01-02T20:00:00Z");
    await post(`/groups/${groupId}/settlements`, {
      fromMemberId: ids.Alex,
      toMemberId: ids.Bruno,
      amount: 1000,
    });

    const balances = (
      await app.inject({ method: "GET", url: `/groups/${groupId}/balances` })
    ).json().members;
    for (const { memberId, balance } of balances) {
      const items = (await statement(memberId)).json().items;
      expect(items.at(-1)?.balance ?? 0).toBe(balance);
    }
  });

  it("slots a backdated expense in and recomputes later balances", async () => {
    await dinner("2026-01-05T20:00:00Z");
    await dinner("2026-01-01T20:00:00Z", 3000);

    expect(await lines(ids.Carla!)).toEqual([
      ["expense", -1000, -1000],
      ["expense", -3000, -4000],
    ]);
  });

  it("carries the running balance across pages", async () => {
    for (let day = 1; day <= 5; day++) await dinner(`2026-01-0${day}T20:00:00Z`, 300 * day);

    const first = (await statement(ids.Carla!, "?limit=2")).json();
    const second = (await statement(ids.Carla!, `?limit=2&cursor=${first.nextCursor}`)).json();
    const third = (await statement(ids.Carla!, `?limit=2&cursor=${second.nextCursor}`)).json();

    const balances = [...first.items, ...second.items, ...third.items].map(
      (l: { balance: number }) => l.balance,
    );
    expect(balances).toEqual([-100, -300, -600, -1000, -1500]);
    expect(third.nextCursor).toBeNull();
  });

  it("is empty for a member with no entries", async () => {
    expect((await statement(ids.Alex!)).json().items).toEqual([]);
  });

  it("returns 404 for a member outside the group", async () => {
    const res = await statement(randomUUID());
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for an unknown group", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/groups/${randomUUID()}/members/${ids.Bruno}/statement`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for a malformed member id", async () => {
    const res = await statement("nope");
    expect(res.statusCode).toBe(400);
  });
});

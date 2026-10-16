import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testApp } from "../support/app.js";
import { testDb as db } from "../support/db.js";

describe("POST /groups/:groupId/members", () => {
  const app = testApp();

  const create = async (url: "/members" | "/groups", name: string): Promise<string> =>
    (await app.inject({ method: "POST", url, payload: { name } })).json().id;

  const join = (groupId: string, memberId: string) =>
    app.inject({ method: "POST", url: `/groups/${groupId}/members`, payload: { memberId } });

  it("adds the member and opens exactly one account", async () => {
    const groupId = await create("/groups", "Trip");
    const memberId = await create("/members", "Bruno");

    const res = await join(groupId, memberId);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ groupId, memberId, joinedAt: expect.any(String) });
    const accounts = await db.selectFrom("accounts").selectAll().execute();
    expect(accounts).toEqual([{ id: expect.any(String), group_id: groupId, member_id: memberId }]);
  });

  it("gives a member one account per group", async () => {
    const trip = await create("/groups", "Trip");
    const flat = await create("/groups", "Flat");
    const memberId = await create("/members", "Bruno");

    await join(trip, memberId);
    await join(flat, memberId);

    const accounts = await db.selectFrom("accounts").select("group_id").execute();
    expect(accounts.map((a) => a.group_id).sort()).toEqual([trip, flat].sort());
  });

  it("rejects joining twice with 409", async () => {
    const groupId = await create("/groups", "Trip");
    const memberId = await create("/members", "Bruno");
    await join(groupId, memberId);

    const res = await join(groupId, memberId);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("already_member");
  });

  it("opens one account when the same join races", async () => {
    const groupId = await create("/groups", "Trip");
    const memberId = await create("/members", "Bruno");

    const results = await Promise.all([join(groupId, memberId), join(groupId, memberId)]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await db.selectFrom("accounts").selectAll().execute()).toHaveLength(1);
  });

  it("returns 404 for an unknown group", async () => {
    const memberId = await create("/members", "Bruno");
    const res = await join(randomUUID(), memberId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });

  it("returns 404 for an unknown member", async () => {
    const groupId = await create("/groups", "Trip");
    const res = await join(groupId, randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toMatch(/^member /);
  });

  it("rejects a malformed group id with 400", async () => {
    const res = await join("not-a-uuid", randomUUID());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toBe("groupId");
  });
});

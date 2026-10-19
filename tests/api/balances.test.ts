import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { seedGroup, testApp } from "../support/app.js";
import { expectLedgerInvariants } from "../support/invariants.js";

describe("GET /groups/:groupId/balances", () => {
  const app = testApp();
  afterEach(expectLedgerInvariants);

  const balances = async (groupId: string) => {
    const res = await app.inject({ method: "GET", url: `/groups/${groupId}/balances` });
    expect(res.statusCode).toBe(200);
    return res.json();
  };

  /** name -> { balance, sent, received } */
  const byName = async (groupId: string) =>
    Object.fromEntries(
      (await balances(groupId)).members.map(
        (m: { name: string; balance: number; sent: number; received: number }) => [
          m.name,
          { balance: m.balance, sent: m.sent, received: m.received },
        ],
      ),
    );

  it("states currency and sign convention", async () => {
    const { groupId } = await seedGroup(app, []);
    expect(await balances(groupId)).toEqual({
      groupId,
      currency: "EUR",
      note: expect.stringMatching(/balance > 0 means the member is owed money/),
      members: [],
    });
  });

  it("shows a member with no transactions at zero", async () => {
    const { groupId, ids } = await seedGroup(app, ["Bruno"]);
    expect((await balances(groupId)).members).toEqual([
      { memberId: ids.Bruno, name: "Bruno", balance: 0, sent: 0, received: 0 },
    ]);
  });

  it("derives balances from an expense, ordered by name", async () => {
    const { groupId, ids } = await seedGroup(app, ["Bruno", "Carla", "Alex"]);
    await app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 9000,
        description: "Dinner",
        split: { type: "equal", memberIds: [ids.Bruno, ids.Carla, ids.Alex] },
      },
    });

    const { members } = await balances(groupId);
    expect(members.map((m: { name: string }) => m.name)).toEqual(["Alex", "Bruno", "Carla"]);
    expect(await byName(groupId)).toEqual({
      Alex: { balance: -3000, sent: 0, received: 0 },
      Bruno: { balance: 6000, sent: 0, received: 0 },
      Carla: { balance: -3000, sent: 0, received: 0 },
    });
  });

  it("counts settlements as sent and received", async () => {
    const { groupId, ids } = await seedGroup(app, ["Bruno", "Carla"]);
    await app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 3000,
        description: "Tickets",
        split: { type: "equal", memberIds: [ids.Carla] },
      },
    });
    await app.inject({
      method: "POST",
      url: `/groups/${groupId}/settlements`,
      payload: { fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 3000 },
    });

    expect(await byName(groupId)).toEqual({
      Bruno: { balance: 0, sent: 0, received: 3000 },
      Carla: { balance: 0, sent: 3000, received: 0 },
    });
  });

  it("leaves a voided settlement out of sent and received", async () => {
    const { groupId, ids } = await seedGroup(app, ["Bruno", "Carla"]);
    await app.inject({
      method: "POST",
      url: `/groups/${groupId}/expenses`,
      payload: {
        payerId: ids.Bruno,
        amount: 3000,
        description: "Tickets",
        split: { type: "equal", memberIds: [ids.Carla] },
      },
    });
    const settlement = await app.inject({
      method: "POST",
      url: `/groups/${groupId}/settlements`,
      payload: { fromMemberId: ids.Carla, toMemberId: ids.Bruno, amount: 3000 },
    });
    await app.inject({ method: "POST", url: `/transactions/${settlement.json().id}/void` });

    expect(await byName(groupId)).toEqual({
      Bruno: { balance: 3000, sent: 0, received: 0 },
      Carla: { balance: -3000, sent: 0, received: 0 },
    });
  });

  it("keeps balances separate per group", async () => {
    const trip = await seedGroup(app, ["Bruno", "Carla"]);
    const flat = await app.inject({ method: "POST", url: "/groups", payload: { name: "Flat" } });
    const flatId = flat.json().id;
    await app.inject({
      method: "POST",
      url: `/groups/${flatId}/members`,
      payload: { memberId: trip.ids.Bruno },
    });
    await app.inject({
      method: "POST",
      url: `/groups/${trip.groupId}/expenses`,
      payload: {
        payerId: trip.ids.Bruno,
        amount: 1000,
        description: "Taxi",
        split: { type: "equal", memberIds: [trip.ids.Carla] },
      },
    });

    expect((await byName(trip.groupId)).Bruno.balance).toBe(1000);
    expect((await byName(flatId)).Bruno.balance).toBe(0);
  });

  it("returns 404 for an unknown group", async () => {
    const res = await app.inject({ method: "GET", url: `/groups/${randomUUID()}/balances` });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for a malformed group id", async () => {
    const res = await app.inject({ method: "GET", url: "/groups/nope/balances" });
    expect(res.statusCode).toBe(400);
  });
});

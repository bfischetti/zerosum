import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

/**
 * Creates a sample group through the public API, so the seed goes through the
 * same validation, ledger rules and idempotency as any client. Each run makes
 * a new group with new members; nothing existing is touched.
 */
export async function seedSampleGroup(app: FastifyInstance) {
  const post = async <T = { id: string }>(url: string, payload?: object): Promise<T> => {
    const res = await app.inject({
      method: "POST",
      url,
      headers: { "idempotency-key": randomUUID() },
      ...(payload && { payload }),
    });
    if (res.statusCode !== 201) throw new Error(`POST ${url} failed: ${res.statusCode} ${res.body}`);
    return res.json() as T;
  };

  const group = await post("/groups", { name: "Lisbon trip" });
  const ids: Record<string, string> = {};
  for (const name of ["Bruno", "Carla", "Alex", "Dana"]) {
    const member = await post("/members", { name });
    await post(`/groups/${group.id}/members`, { memberId: member.id });
    ids[name] = member.id;
  }
  const { Bruno, Carla, Alex, Dana } = ids as Record<"Bruno" | "Carla" | "Alex" | "Dana", string>;
  const everyone = [Bruno, Carla, Alex, Dana];

  const expense = (payload: object) => post(`/groups/${group.id}/expenses`, payload);

  await expense({
    payerId: Carla,
    amount: 48_000,
    description: "Apartment, 3 nights",
    occurredAt: "2026-06-12T15:00:00Z",
    split: { type: "equal", memberIds: everyone },
  });
  await expense({
    payerId: Bruno,
    amount: 9_000,
    description: "Dinner in Alfama",
    occurredAt: "2026-06-12T21:30:00Z",
    split: { type: "equal", memberIds: [Bruno, Carla, Alex] },
  });
  await expense({
    payerId: Alex,
    amount: 5_230,
    description: "Groceries",
    occurredAt: "2026-06-13T10:00:00Z",
    split: {
      type: "exact",
      shares: [
        { memberId: Bruno, amount: 1_500 },
        { memberId: Carla, amount: 1_230 },
        { memberId: Alex, amount: 1_000 },
        { memberId: Dana, amount: 1_500 },
      ],
    },
  });
  await expense({
    payerId: Dana,
    amount: 2_500,
    description: "Taxi to Belém",
    occurredAt: "2026-06-13T14:00:00Z",
    split: { type: "equal", memberIds: [Dana, Bruno, Carla] },
  });
  await expense({
    payerId: Bruno,
    amount: 6_400,
    description: "Museum tickets",
    occurredAt: "2026-06-13T15:00:00Z",
    split: { type: "equal", memberIds: everyone },
  });
  // Recorded twice by mistake, then voided.
  const duplicate = await expense({
    payerId: Bruno,
    amount: 6_400,
    description: "Museum tickets",
    occurredAt: "2026-06-13T15:00:00Z",
    split: { type: "equal", memberIds: everyone },
  });
  await post(`/transactions/${duplicate.id}/void`, { description: "Entered twice" });

  await post(`/groups/${group.id}/settlements`, {
    fromMemberId: Alex,
    toMemberId: Carla,
    amount: 10_000,
    description: "Bank transfer",
    occurredAt: "2026-06-16T09:00:00Z",
  });

  return { groupId: group.id, memberIds: ids };
}

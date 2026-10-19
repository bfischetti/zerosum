import { afterEach, describe, expect, it } from "vitest";
import { seedSampleGroup } from "../../src/seed.js";
import { testApp } from "../support/app.js";
import { expectLedgerInvariants } from "../support/invariants.js";

describe("seedSampleGroup", () => {
  const app = testApp({ autoKey: false });
  afterEach(expectLedgerInvariants);

  it("creates a consistent sample group", async () => {
    const { groupId, memberIds } = await seedSampleGroup(app);

    const balances = (
      await app.inject({ method: "GET", url: `/groups/${groupId}/balances` })
    ).json().members as Array<{ memberId: string; balance: number }>;
    const balanceOf = (name: string) => balances.find((b) => b.memberId === memberIds[name])!.balance;

    // Alex isn't in the taxi split, whose leftover cent depends on member ids.
    expect(balanceOf("Alex")).toBe(-2370);
    expect([19_336, 19_337]).toContain(balanceOf("Carla"));

    const history = (
      await app.inject({ method: "GET", url: `/groups/${groupId}/transactions` })
    ).json().items as Array<{ type: string; voidedById: string | null }>;
    expect(history.filter((t) => t.type === "expense")).toHaveLength(6);
    expect(history.filter((t) => t.type === "settlement")).toHaveLength(1);
    expect(history.filter((t) => t.type === "reversal")).toHaveLength(1);
    expect(history.filter((t) => t.voidedById !== null)).toHaveLength(1);
  });

  it("can run again without touching the first group", async () => {
    const first = await seedSampleGroup(app);
    const second = await seedSampleGroup(app);
    expect(second.groupId).not.toBe(first.groupId);
  });
});

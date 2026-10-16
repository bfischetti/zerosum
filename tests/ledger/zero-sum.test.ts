import { describe, expect, it } from "vitest";
import { testDb as db } from "../support/db.js";
import { groupWith, postTransaction } from "../support/fixtures.js";

describe("zero-sum invariant", () => {
  it("rejects an unbalanced transaction at commit", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await expect(
      postTransaction(db, groupId, [
        [a.Bruno!, -9000],
        [a.Carla!, 3000],
      ]),
    ).rejects.toThrow(/sum to -6000, not 0/);
    expect(await db.selectFrom("transactions").selectAll().execute()).toEqual([]);
  });

  it("rejects a transaction with a single entry", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno"]);
    await expect(postTransaction(db, groupId, [[a.Bruno!, 100]])).rejects.toThrow(
      /has 1 entries; at least 2 are required/,
    );
  });

  it("rejects a transaction with no entries", async () => {
    const { groupId } = await groupWith(db, []);
    await expect(postTransaction(db, groupId, [])).rejects.toThrow(
      /has 0 entries; at least 2 are required/,
    );
  });

  it("checks at commit, not per statement", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await db.transaction().execute(async (trx) => {
      const tx = await trx
        .insertInto("transactions")
        .values({ group_id: groupId, type: "settlement", amount: 3000 })
        .returning("id")
        .executeTakeFirstOrThrow();
      const entry = (account_id: string, amount: number) => ({
        transaction_id: tx.id,
        group_id: groupId,
        account_id,
        amount,
      });
      // Unbalanced after this statement; balanced by the next one.
      await trx.insertInto("entries").values(entry(a.Carla!, -3000)).execute();
      await trx.insertInto("entries").values(entry(a.Bruno!, 3000)).execute();
    });
    expect(await db.selectFrom("entries").selectAll().execute()).toHaveLength(2);
  });
});

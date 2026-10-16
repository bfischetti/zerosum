import { beforeEach, describe, expect, it } from "vitest";
import { testDb as db } from "../support/db.js";
import { groupWith, postTransaction, type Fixture } from "../support/fixtures.js";

describe("append-only ledger", () => {
  let f: Fixture;
  let txId: string;

  beforeEach(async () => {
    f = await groupWith(db, ["Bruno", "Carla", "Alex", "Dana", "Eve"]);
    txId = await postTransaction(db, f.groupId, [
      [f.accounts.Bruno!, -6000],
      [f.accounts.Carla!, 3000],
      [f.accounts.Alex!, 3000],
    ]);
  });

  it("rejects UPDATE on transactions", async () => {
    await expect(
      db.updateTable("transactions").set({ description: "edited" }).execute(),
    ).rejects.toThrow(/transactions is append-only: UPDATE/);
  });

  it("rejects DELETE on transactions", async () => {
    await expect(db.deleteFrom("transactions").execute()).rejects.toThrow(
      /transactions is append-only: DELETE/,
    );
  });

  it("rejects UPDATE on entries", async () => {
    await expect(db.updateTable("entries").set({ amount: 1 }).execute()).rejects.toThrow(
      /entries is append-only: UPDATE/,
    );
  });

  it("rejects DELETE on entries", async () => {
    await expect(db.deleteFrom("entries").execute()).rejects.toThrow(
      /entries is append-only: DELETE/,
    );
  });

  it("rejects moving an account to another member", async () => {
    await expect(
      db.updateTable("accounts").set({ member_id: f.accounts.Carla! }).execute(),
    ).rejects.toThrow(/accounts is append-only: UPDATE/);
  });

  it("rejects removing a membership", async () => {
    await expect(db.deleteFrom("group_members").execute()).rejects.toThrow(
      /group_members is append-only: DELETE/,
    );
  });

  it("rejects adding a balanced pair of entries to a committed transaction", async () => {
    await expect(
      db
        .insertInto("entries")
        .values(
          [
            // Accounts with no entry in this transaction yet, so the unique
            // (transaction_id, account_id) constraint is not what rejects it.
            [f.accounts.Dana!, 500],
            [f.accounts.Eve!, -500],
          ].map(([account_id, amount]) => ({
            transaction_id: txId,
            group_id: f.groupId,
            account_id: account_id as string,
            amount: amount as number,
          })),
        )
        .execute(),
    ).rejects.toThrow(/is already committed/);
  });
});

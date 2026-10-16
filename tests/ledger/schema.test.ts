import { describe, expect, it } from "vitest";
import { testDb as db } from "../support/db.js";
import { groupWith, postTransaction } from "../support/fixtures.js";

describe("ledger schema constraints", () => {
  it("accepts a balanced expense", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla", "Alex"]);
    await postTransaction(db, groupId, [
      [a.Bruno!, -6000],
      [a.Carla!, 3000],
      [a.Alex!, 3000],
    ]);
    const rows = await db.selectFrom("entries").select("amount").execute();
    expect(rows.map((r) => r.amount).sort()).toEqual([-6000, 3000, 3000]);
  });

  it("rejects an entry on an account from another group", async () => {
    const trip = await groupWith(db, ["Bruno", "Carla"]);
    const flat = await groupWith(db, ["Alex"]);
    await expect(
      postTransaction(db, trip.groupId, [
        [trip.accounts.Bruno!, -100],
        [flat.accounts.Alex!, 100],
      ]),
    ).rejects.toThrow(/entries_account_id_group_id_fkey/);
  });

  it("rejects a zero amount", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await expect(
      postTransaction(db, groupId, [
        [a.Bruno!, 0],
        [a.Carla!, 0],
      ]),
    ).rejects.toThrow(/entries_amount_check/);
  });

  it("rejects two entries on the same account in one transaction", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await expect(
      postTransaction(db, groupId, [
        [a.Bruno!, -9000],
        [a.Bruno!, 3000],
        [a.Carla!, 6000],
      ]),
    ).rejects.toThrow(/entries_transaction_id_account_id_key/);
  });

  it("rejects a second account for the same membership", async () => {
    const { groupId } = await groupWith(db, ["Bruno"]);
    const { member_id } = await db
      .selectFrom("group_members")
      .select("member_id")
      .executeTakeFirstOrThrow();
    await expect(
      db.insertInto("accounts").values({ group_id: groupId, member_id }).execute(),
    ).rejects.toThrow(/accounts_group_id_member_id_key/);
  });

  it("requires reverses_id exactly when the type is reversal", async () => {
    const { groupId } = await groupWith(db, []);
    await expect(
      db.insertInto("transactions").values({ group_id: groupId, type: "reversal", amount: 100 }).execute(),
    ).rejects.toThrow(/transactions_check/);
  });

  it("rejects a reversal in a different group from its original", async () => {
    const trip = await groupWith(db, ["Bruno", "Carla"]);
    const flat = await groupWith(db, ["Alex", "Dana"]);
    const original = await postTransaction(db, trip.groupId, [
      [trip.accounts.Bruno!, -100],
      [trip.accounts.Carla!, 100],
    ]);
    await expect(
      postTransaction(
        db,
        flat.groupId,
        [
          [flat.accounts.Alex!, 100],
          [flat.accounts.Dana!, -100],
        ],
        { type: "reversal", reversesId: original },
      ),
    ).rejects.toThrow(/transactions_reverses_id_group_id_fkey/);
  });

  it("allows a transaction to be voided at most once", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    const original = await postTransaction(db, groupId, [
      [a.Bruno!, -100],
      [a.Carla!, 100],
    ]);
    const mirror: Array<[string, number]> = [
      [a.Bruno!, 100],
      [a.Carla!, -100],
    ];
    await postTransaction(db, groupId, mirror, { type: "reversal", reversesId: original });
    await expect(
      postTransaction(db, groupId, mirror, { type: "reversal", reversesId: original }),
    ).rejects.toThrow(/transactions_reverses_id_key/);
  });
});

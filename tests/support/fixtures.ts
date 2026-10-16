import type { Db, TransactionType } from "../../src/db.js";

export interface Fixture {
  groupId: string;
  /** Account id per member name. */
  accounts: Record<string, string>;
}

/** Inserts a group whose members each have their one account. Bypasses the API. */
export async function groupWith(db: Db, names: string[]): Promise<Fixture> {
  const group = await db
    .insertInto("groups")
    .values({ name: "Trip" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const accounts: Record<string, string> = {};
  for (const name of names) {
    const member = await db
      .insertInto("members")
      .values({ name })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("group_members")
      .values({ group_id: group.id, member_id: member.id })
      .execute();
    const account = await db
      .insertInto("accounts")
      .values({ group_id: group.id, member_id: member.id })
      .returning("id")
      .executeTakeFirstOrThrow();
    accounts[name] = account.id;
  }
  return { groupId: group.id, accounts };
}

/**
 * Inserts a transaction and its entries in one DB transaction.
 * `entries` maps account id to amount.
 */
export async function postTransaction(
  db: Db,
  groupId: string,
  entries: Array<[accountId: string, amount: number]>,
  opts: { type?: TransactionType; reversesId?: string } = {},
): Promise<string> {
  return db.transaction().execute(async (trx) => {
    const tx = await trx
      .insertInto("transactions")
      .values({
        group_id: groupId,
        type: opts.type ?? "expense",
        reverses_id: opts.reversesId ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (entries.length > 0) {
      await trx
        .insertInto("entries")
        .values(
          entries.map(([account_id, amount]) => ({
            transaction_id: tx.id,
            group_id: groupId,
            account_id,
            amount,
          })),
        )
        .execute();
    }
    return tx.id;
  });
}

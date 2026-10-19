import { expect } from "vitest";
import { groupBalances } from "../../src/balances/balances.js";
import { testDb as db } from "./db.js";

/**
 * The ledger's global invariants, checked through the same balance query the
 * API uses: every group's balances sum to zero, and so does every transaction.
 */
export async function expectLedgerInvariants(): Promise<void> {
  const groups = await db.selectFrom("groups").select("id").execute();
  for (const { id } of groups) {
    const members = await groupBalances(db, id);
    const total = members.reduce((sum, m) => sum + m.balance, 0);
    expect(total, `balances of group ${id} sum to ${total}`).toBe(0);
  }

  const unbalanced = await db
    .selectFrom("entries")
    .select(["transaction_id", (eb) => eb.fn.sum<string>("amount").as("total")])
    .groupBy("transaction_id")
    .having((eb) => eb.fn.sum("amount"), "<>", 0)
    .execute();
  expect(unbalanced).toEqual([]);
}

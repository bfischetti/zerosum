import type { Db } from "../db.js";
import { AppError, notFound } from "../http/errors.js";
import { computeShares, netExpense, type Share, type Split } from "./split.js";

export interface ExpenseInput {
  payerId: string;
  amount: number;
  description: string;
  occurredAt?: Date;
  split: Split;
}

export interface Expense {
  id: string;
  groupId: string;
  type: "expense";
  description: string;
  amount: number;
  payerId: string;
  shares: Share[];
  occurredAt: Date;
  recordedAt: Date;
}

/** Records an expense as one ledger transaction with one netted entry per member. */
export async function recordExpense(
  db: Db,
  groupId: string,
  input: ExpenseInput,
): Promise<Expense> {
  if (input.occurredAt && input.occurredAt.getTime() > Date.now()) {
    throw new AppError(422, "occurred_in_future", "occurredAt cannot be in the future");
  }

  return db.transaction().execute(async (trx) => {
    const group = await trx
      .selectFrom("groups")
      .select("id")
      .where("id", "=", groupId)
      .executeTakeFirst();
    if (!group) throw notFound("group", groupId);

    const shares = computeShares(input.amount, input.split);
    const net = netExpense(input.payerId, input.amount, shares);

    // Payer and participants alike must be members now (membership is checked
    // at recording time, not against occurredAt).
    const memberIds = [...new Set([input.payerId, ...shares.map((s) => s.memberId)])];
    const accounts = await trx
      .selectFrom("accounts")
      .select(["id", "member_id"])
      .where("group_id", "=", groupId)
      .where("member_id", "in", memberIds)
      .execute();
    const accountOf = new Map(accounts.map((a) => [a.member_id, a.id]));
    const outsiders = memberIds.filter((id) => !accountOf.has(id));
    if (outsiders.length > 0) {
      throw new AppError(
        422,
        "not_a_member",
        `not members of group ${groupId}: ${outsiders.join(", ")}`,
        { memberIds: outsiders },
      );
    }

    const tx = await trx
      .insertInto("transactions")
      .values({
        group_id: groupId,
        type: "expense",
        description: input.description,
        amount: input.amount,
        ...(input.occurredAt && { occurred_at: input.occurredAt }),
      })
      .returning(["id", "occurred_at", "recorded_at"])
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("entries")
      .values(
        [...net].map(([memberId, amount]) => ({
          transaction_id: tx.id,
          group_id: groupId,
          account_id: accountOf.get(memberId)!,
          amount,
        })),
      )
      .execute();

    return {
      id: tx.id,
      groupId,
      type: "expense",
      description: input.description,
      amount: input.amount,
      payerId: input.payerId,
      shares,
      occurredAt: tx.occurred_at,
      recordedAt: tx.recorded_at,
    };
  });
}

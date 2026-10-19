import type { Transaction } from "kysely";
import type { Database, TransactionType } from "../db.js";
import { AppError, notFound } from "../http/errors.js";

export type Trx = Transaction<Database>;

export async function requireGroup(trx: Trx, groupId: string): Promise<void> {
  const group = await trx
    .selectFrom("groups")
    .select("id")
    .where("id", "=", groupId)
    .executeTakeFirst();
  if (!group) throw notFound("group", groupId);
}

export function rejectFutureOccurredAt(occurredAt: Date | undefined): void {
  if (occurredAt && occurredAt.getTime() > Date.now()) {
    throw new AppError(422, "occurred_in_future", "occurredAt cannot be in the future");
  }
}

export interface LedgerTransaction {
  groupId: string;
  type: Exclude<TransactionType, "reversal">;
  description: string | null;
  amount: number;
  occurredAt?: Date;
  /** One netted amount per member id, positive meaning debit. Sums to zero. */
  entries: Map<string, number>;
}

/**
 * Inserts a transaction and its entries inside the caller's DB transaction.
 * Every member involved must have an account in the group now: membership is
 * checked at recording time, not against occurredAt.
 */
export async function postLedgerTransaction(
  trx: Trx,
  input: LedgerTransaction,
): Promise<{ id: string; occurredAt: Date; recordedAt: Date }> {
  const memberIds = [...input.entries.keys()];
  const accounts = await trx
    .selectFrom("accounts")
    .select(["id", "member_id"])
    .where("group_id", "=", input.groupId)
    .where("member_id", "in", memberIds)
    .execute();
  const accountOf = new Map(accounts.map((a) => [a.member_id, a.id]));
  const outsiders = memberIds.filter((id) => !accountOf.has(id));
  if (outsiders.length > 0) {
    throw new AppError(
      422,
      "not_a_member",
      `not members of group ${input.groupId}: ${outsiders.join(", ")}`,
      { memberIds: outsiders },
    );
  }

  const tx = await trx
    .insertInto("transactions")
    .values({
      group_id: input.groupId,
      type: input.type,
      description: input.description,
      amount: input.amount,
      ...(input.occurredAt && { occurred_at: input.occurredAt }),
    })
    .returning(["id", "occurred_at", "recorded_at"])
    .executeTakeFirstOrThrow();

  await trx
    .insertInto("entries")
    .values(
      [...input.entries].map(([memberId, amount]) => ({
        transaction_id: tx.id,
        group_id: input.groupId,
        account_id: accountOf.get(memberId)!,
        amount,
      })),
    )
    .execute();

  return { id: tx.id, occurredAt: tx.occurred_at, recordedAt: tx.recorded_at };
}

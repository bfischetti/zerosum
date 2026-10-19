import type { Db } from "../db.js";
import { AppError, conflict, notFound } from "../http/errors.js";

export interface Reversal {
  id: string;
  groupId: string;
  type: "reversal";
  reversesId: string;
  description: string | null;
  amount: number;
  occurredAt: Date;
  recordedAt: Date;
}

const alreadyVoided = (id: string) => conflict("already_voided", `transaction ${id} is already voided`);

/** Postgres unique_violation on the one-reversal-per-transaction key. */
const isDuplicateReversal = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: string }).code === "23505" &&
  (err as { constraint?: string }).constraint === "transactions_reverses_id_key";

/**
 * Voids an expense or settlement by posting a reversal: a transaction whose
 * entries mirror the original's with the signs flipped. The reversal occurs
 * now, whatever the original's occurredAt.
 *
 * The mirror is built here, not checked by the database (ADR 0002).
 */
export async function voidTransaction(
  db: Db,
  transactionId: string,
  description?: string,
): Promise<Reversal> {
  try {
    return await db.transaction().execute(async (trx) => {
      const original = await trx
        .selectFrom("transactions")
        .select(["id", "group_id", "type", "amount"])
        .where("id", "=", transactionId)
        .executeTakeFirst();
      if (!original) throw notFound("transaction", transactionId);
      if (original.type === "reversal") {
        throw new AppError(
          422,
          "reversal_not_voidable",
          `transaction ${transactionId} is a reversal and cannot be voided`,
        );
      }

      const existing = await trx
        .selectFrom("transactions")
        .select("id")
        .where("reverses_id", "=", transactionId)
        .executeTakeFirst();
      if (existing) throw alreadyVoided(transactionId);

      // A concurrent void of the same transaction blocks on the unique
      // reverses_id index until this one commits, then fails as a duplicate.
      const reversal = await trx
        .insertInto("transactions")
        .values({
          group_id: original.group_id,
          type: "reversal",
          reverses_id: original.id,
          description: description ?? null,
          amount: original.amount,
        })
        .returning(["id", "description", "occurred_at", "recorded_at"])
        .executeTakeFirstOrThrow();

      const entries = await trx
        .selectFrom("entries")
        .select(["account_id", "amount"])
        .where("transaction_id", "=", original.id)
        .execute();
      await trx
        .insertInto("entries")
        .values(
          entries.map((e) => ({
            transaction_id: reversal.id,
            group_id: original.group_id,
            account_id: e.account_id,
            amount: -e.amount,
          })),
        )
        .execute();

      return {
        id: reversal.id,
        groupId: original.group_id,
        type: "reversal" as const,
        reversesId: original.id,
        description: reversal.description,
        amount: original.amount,
        occurredAt: reversal.occurred_at,
        recordedAt: reversal.recorded_at,
      };
    });
  } catch (err) {
    if (isDuplicateReversal(err)) throw alreadyVoided(transactionId);
    throw err;
  }
}

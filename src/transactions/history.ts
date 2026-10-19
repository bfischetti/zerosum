import { sql } from "kysely";
import type { Db, TransactionType } from "../db.js";
import { notFound } from "../http/errors.js";
import { decodeCursor, page } from "../http/pagination.js";

export interface HistoryItem {
  id: string;
  type: TransactionType;
  description: string | null;
  amount: number;
  occurredAt: Date;
  recordedAt: Date;
  /** For a reversal: the transaction it reverses. */
  reversesId: string | null;
  /** For a voided expense or settlement: its reversal. */
  voidedById: string | null;
  /** How the transaction moved each member's Balance (positive = now owed more). */
  balanceChanges: Array<{ memberId: string; amount: number }>;
}

interface Row extends Omit<HistoryItem, "balanceChanges"> {
  occurredAtKey: string;
  recordedAtKey: string;
}

/**
 * A group's transactions, newest first, one row per transaction: voided
 * originals and their reversals both appear, linked both ways.
 */
export async function groupHistory(
  db: Db,
  groupId: string,
  opts: { cursor?: string; limit: number },
) {
  const group = await db
    .selectFrom("groups")
    .select("id")
    .where("id", "=", groupId)
    .executeTakeFirst();
  if (!group) throw notFound("group", groupId);

  const after = opts.cursor ? decodeCursor(opts.cursor) : null;

  const { rows } = await sql<Row>`
    select
      t.id,
      t.type,
      t.description,
      t.amount,
      t.occurred_at as "occurredAt",
      t.recorded_at as "recordedAt",
      t.occurred_at::text as "occurredAtKey",
      t.recorded_at::text as "recordedAtKey",
      t.reverses_id as "reversesId",
      v.id as "voidedById"
    from transactions t
    left join transactions v on v.reverses_id = t.id
    where t.group_id = ${groupId}
      ${
        after
          ? sql`and (t.occurred_at, t.recorded_at, t.id)
                  < (${after.occurredAt}::timestamptz, ${after.recordedAt}::timestamptz, ${after.id}::uuid)`
          : sql``
      }
    order by t.occurred_at desc, t.recorded_at desc, t.id desc
    limit ${opts.limit + 1}
  `.execute(db);

  const result = page(rows, opts.limit, (r) => ({
    occurredAt: r.occurredAtKey,
    recordedAt: r.recordedAtKey,
    id: r.id,
  }));

  const ids = result.items.map((r) => r.id);
  const changes = ids.length
    ? await db
        .selectFrom("entries")
        .innerJoin("accounts", "accounts.id", "entries.account_id")
        .select(["entries.transaction_id", "accounts.member_id", "entries.amount"])
        .where("entries.transaction_id", "in", ids)
        .orderBy("accounts.member_id")
        .execute()
    : [];

  return {
    items: result.items.map(({ occurredAtKey, recordedAtKey, ...item }): HistoryItem => ({
      ...item,
      balanceChanges: changes
        .filter((c) => c.transaction_id === item.id)
        // Entries are debit-positive; a Balance is the negation.
        .map((c) => ({ memberId: c.member_id, amount: -c.amount })),
    })),
    nextCursor: result.nextCursor,
  };
}

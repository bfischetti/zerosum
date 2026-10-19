import { sql } from "kysely";
import type { Db, TransactionType } from "../db.js";
import { AppError, notFound } from "../http/errors.js";
import { decodeCursor, page } from "../http/pagination.js";

export interface StatementLine {
  transactionId: string;
  type: TransactionType;
  description: string | null;
  occurredAt: Date;
  recordedAt: Date;
  reversesId: string | null;
  /** How this transaction moved the member's Balance. */
  change: number;
  /** The member's Balance after this line. */
  balance: number;
}

interface Row extends StatementLine {
  occurredAtKey: string;
  recordedAtKey: string;
}

/**
 * Every entry on a member's account in a group, oldest first, with a running
 * Balance. The running total is computed over the whole account before the
 * page is cut, so every page starts from the right balance.
 */
export async function memberStatement(
  db: Db,
  groupId: string,
  memberId: string,
  opts: { cursor?: string; limit: number },
) {
  const group = await db
    .selectFrom("groups")
    .select("id")
    .where("id", "=", groupId)
    .executeTakeFirst();
  if (!group) throw notFound("group", groupId);

  const account = await db
    .selectFrom("accounts")
    .select("id")
    .where("group_id", "=", groupId)
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  if (!account) {
    throw new AppError(404, "not_found", `member ${memberId} is not in group ${groupId}`);
  }

  const after = opts.cursor ? decodeCursor(opts.cursor) : null;

  const { rows } = await sql<Row>`
    with lines as (
      select
        t.id as "transactionId",
        t.type,
        t.description,
        t.occurred_at as "occurredAt",
        t.recorded_at as "recordedAt",
        t.occurred_at::text as "occurredAtKey",
        t.recorded_at::text as "recordedAtKey",
        t.reverses_id as "reversesId",
        -- Entries are debit-positive; a Balance is the negation.
        (-e.amount)::bigint as change,
        (sum(-e.amount) over (order by t.occurred_at, t.recorded_at, t.id))::bigint as balance,
        t.occurred_at as sort_occurred_at,
        t.recorded_at as sort_recorded_at,
        t.id as sort_id
      from entries e
      join transactions t on t.id = e.transaction_id
      where e.account_id = ${account.id}
    )
    select "transactionId", type, description, "occurredAt", "recordedAt",
           "occurredAtKey", "recordedAtKey", "reversesId", change, balance
    from lines
    ${
      after
        ? sql`where (sort_occurred_at, sort_recorded_at, sort_id)
                > (${after.occurredAt}::timestamptz, ${after.recordedAt}::timestamptz, ${after.id}::uuid)`
        : sql``
    }
    order by sort_occurred_at, sort_recorded_at, sort_id
    limit ${opts.limit + 1}
  `.execute(db);

  const result = page(rows, opts.limit, (r) => ({
    occurredAt: r.occurredAtKey,
    recordedAt: r.recordedAtKey,
    id: r.transactionId,
  }));

  return {
    groupId,
    memberId,
    items: result.items.map(({ occurredAtKey, recordedAtKey, ...line }) => line),
    nextCursor: result.nextCursor,
  };
}

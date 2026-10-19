import { sql } from "kysely";
import type { Db } from "../db.js";
import { notFound } from "../http/errors.js";

export interface MemberBalance {
  memberId: string;
  name: string;
  /** Positive: the member is owed money. Negative: they owe. */
  balance: number;
  /** Settlement amounts sent and received, both positive and net of voids. */
  sent: number;
  received: number;
}

/**
 * Every member's Balance in a group, derived from entries. Balance is the
 * negated sum of the member's account (entries are debit-positive).
 *
 * Sent and Received count only settlements that haven't been voided. Splitting
 * the account by entry sign instead would count a settlement's reversal as
 * money flowing back.
 */
export async function groupBalances(db: Db, groupId: string): Promise<MemberBalance[]> {
  const group = await db
    .selectFrom("groups")
    .select("id")
    .where("id", "=", groupId)
    .executeTakeFirst();
  if (!group) throw notFound("group", groupId);

  const { rows } = await sql<MemberBalance>`
    select
      m.id as "memberId",
      m.name,
      (-coalesce(sum(e.amount), 0))::bigint as balance,
      coalesce(sum(-e.amount) filter (where live_settlement.id is not null and e.amount < 0), 0)::bigint as sent,
      coalesce(sum(e.amount)  filter (where live_settlement.id is not null and e.amount > 0), 0)::bigint as received
    from accounts a
    join members m on m.id = a.member_id
    left join entries e on e.account_id = a.id
    left join transactions live_settlement
      on live_settlement.id = e.transaction_id
     and live_settlement.type = 'settlement'
     and not exists (select 1 from transactions r where r.reverses_id = live_settlement.id)
    where a.group_id = ${groupId}
    group by m.id, m.name
    order by m.name, m.id
  `.execute(db);
  return rows;
}

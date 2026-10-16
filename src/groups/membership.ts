import type { Db } from "../db.js";
import { conflict, notFound } from "../http/errors.js";

export interface Membership {
  groupId: string;
  memberId: string;
  joinedAt: Date;
}

/**
 * Adds a member to a group and opens their one account there (ADR 0001),
 * in a single DB transaction. Membership is permanent.
 */
export async function addMemberToGroup(
  db: Db,
  groupId: string,
  memberId: string,
): Promise<Membership> {
  return db.transaction().execute(async (trx) => {
    const group = await trx
      .selectFrom("groups")
      .select("id")
      .where("id", "=", groupId)
      .executeTakeFirst();
    if (!group) throw notFound("group", groupId);

    const member = await trx
      .selectFrom("members")
      .select("id")
      .where("id", "=", memberId)
      .executeTakeFirst();
    if (!member) throw notFound("member", memberId);

    // A concurrent join of the same member blocks on the primary key until the
    // first commits, then lands here as a conflict.
    const joined = await trx
      .insertInto("group_members")
      .values({ group_id: groupId, member_id: memberId })
      .onConflict((oc) => oc.doNothing())
      .returning("joined_at")
      .executeTakeFirst();
    if (!joined) {
      throw conflict("already_member", `member ${memberId} is already in group ${groupId}`);
    }

    await trx
      .insertInto("accounts")
      .values({ group_id: groupId, member_id: memberId })
      .execute();

    return { groupId, memberId, joinedAt: joined.joined_at };
  });
}

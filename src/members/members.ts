import type { Db } from "../db.js";

export interface Member {
  id: string;
  name: string;
  createdAt: Date;
}

export async function createMember(db: Db, name: string): Promise<Member> {
  const row = await db
    .insertInto("members")
    .values({ name })
    .returning(["id", "name", "created_at"])
    .executeTakeFirstOrThrow();
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

import type { Db } from "../db.js";

export interface Group {
  id: string;
  name: string;
  createdAt: Date;
}

export async function createGroup(db: Db, name: string): Promise<Group> {
  const row = await db
    .insertInto("groups")
    .values({ name })
    .returning(["id", "name", "created_at"])
    .executeTakeFirstOrThrow();
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

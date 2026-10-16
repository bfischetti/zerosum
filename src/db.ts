import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

// Table types are added as migrations introduce tables.
export interface Database {}

// Money is integer cents in `bigint` columns. pg returns int8 as a string by
// default; parse it to a number, refusing anything outside the safe-integer range.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`int8 value ${value} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return n;
});

export type Db = Kysely<Database>;

export function createDb(connectionString: string): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString }),
    }),
  });
}

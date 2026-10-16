import { Kysely, PostgresDialect, type ColumnType, type Generated } from "kysely";
import pg from "pg";

type CreatedAt = ColumnType<Date, Date | string | undefined, never>;

export interface MembersTable {
  id: Generated<string>;
  name: string;
  created_at: CreatedAt;
}

export interface GroupsTable {
  id: Generated<string>;
  name: string;
  created_at: CreatedAt;
}

export interface GroupMembersTable {
  group_id: string;
  member_id: string;
  joined_at: CreatedAt;
}

export interface AccountsTable {
  id: Generated<string>;
  group_id: string;
  member_id: string;
}

export type TransactionType = "expense" | "settlement" | "reversal";

export interface TransactionsTable {
  id: Generated<string>;
  group_id: string;
  type: TransactionType;
  description: string | null;
  reverses_id: string | null;
  occurred_at: ColumnType<Date, Date | string | undefined, never>;
  recorded_at: CreatedAt;
}

export interface EntriesTable {
  id: Generated<string>;
  transaction_id: string;
  group_id: string;
  account_id: string;
  /** Integer cents. Positive is a debit, negative is a credit. */
  amount: number;
}

export interface Database {
  members: MembersTable;
  groups: GroupsTable;
  group_members: GroupMembersTable;
  accounts: AccountsTable;
  transactions: TransactionsTable;
  entries: EntriesTable;
}

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

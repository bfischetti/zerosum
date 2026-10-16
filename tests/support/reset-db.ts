import { sql } from "kysely";
import { afterAll, beforeEach } from "vitest";
import { testDb } from "./db.js";

// Tests really commit (deferred constraint triggers only fire at COMMIT; see
// ADR 0002), so isolation is a TRUNCATE of every table before each test.
beforeEach(async () => {
  const { rows } = await sql<{ tablename: string }>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'schema_migrations'
  `.execute(testDb);
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await sql.raw(`truncate ${tables} restart identity cascade`).execute(testDb);
});

afterAll(async () => {
  await testDb.destroy();
});

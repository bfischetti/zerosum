import { config } from "../../src/config.js";
import { createDb } from "../../src/db.js";

// One pool per test file; closed by reset-db.ts after the file's tests finish.
export const testDb = createDb(config.testDatabaseUrl);

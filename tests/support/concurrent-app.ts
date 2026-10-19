import { afterAll } from "vitest";
import { config } from "../../src/config.js";
import { createDb } from "../../src/db.js";
import { testApp } from "./app.js";

/**
 * An app on its own large pool, so many requests can hold a connection at
 * once while the test's starting gate holds another from the shared pool.
 */
export function concurrentApp(opts: { autoKey?: boolean } = {}) {
  const db = createDb(config.testDatabaseUrl, { poolSize: 40 });
  afterAll(() => db.destroy());
  return testApp({ ...opts, db });
}

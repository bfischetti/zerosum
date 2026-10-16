import { afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { testDb } from "./db.js";

/** Builds the app against the test database; closed after the file's tests. */
export function testApp() {
  const app = buildApp({ db: testDb });
  afterAll(() => app.close());
  return app;
}

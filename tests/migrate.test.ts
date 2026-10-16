import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { migrate } from "../src/migrate.js";

describe("migrate", () => {
  it("is a no-op when every migration is already applied", async () => {
    // globalSetup has already migrated the test database.
    expect(await migrate(config.testDatabaseUrl)).toEqual([]);
  });
});

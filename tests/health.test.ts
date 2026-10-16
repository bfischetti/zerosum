import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { testDb } from "./support/db.js";

describe("GET /health", () => {
  const app = buildApp({ db: testDb });
  afterAll(() => app.close());

  it("reports ok when the database is reachable", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

import { describe, expect, it } from "vitest";
import { testApp } from "../support/app.js";

describe("POST /groups", () => {
  const app = testApp();

  it("creates a group", async () => {
    const res = await app.inject({ method: "POST", url: "/groups", payload: { name: "Lisbon trip" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      name: "Lisbon trip",
      createdAt: expect.any(String),
    });
  });

  it("rejects a blank name with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/groups", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toBe("name");
  });
});

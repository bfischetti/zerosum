import { describe, expect, it } from "vitest";
import { testApp } from "../support/app.js";

describe("POST /members", () => {
  const app = testApp();

  it("creates a member", async () => {
    const res = await app.inject({ method: "POST", url: "/members", payload: { name: " Bruno " } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      name: "Bruno",
      createdAt: expect.any(String),
    });
  });

  it.each([
    ["missing name", {}],
    ["blank name", { name: "   " }],
    ["non-string name", { name: 42 }],
  ])("rejects %s with 400", async (_, payload) => {
    const res = await app.inject({ method: "POST", url: "/members", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
    expect(res.json().error.details[0].path).toBe("name");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/members",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });
});

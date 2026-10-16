import { describe, expect, it } from "vitest";
import { testDb as db } from "../support/db.js";
import { groupWith, postTransaction } from "../support/fixtures.js";

describe("reversal rules", () => {
  it("rejects voiding a reversal", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    const forward: Array<[string, number]> = [
      [a.Bruno!, -100],
      [a.Carla!, 100],
    ];
    const backward: Array<[string, number]> = [
      [a.Bruno!, 100],
      [a.Carla!, -100],
    ];
    const original = await postTransaction(db, groupId, forward);
    const reversal = await postTransaction(db, groupId, backward, {
      type: "reversal",
      reversesId: original,
    });
    await expect(
      postTransaction(db, groupId, forward, { type: "reversal", reversesId: reversal }),
    ).rejects.toThrow(/is a reversal and cannot be voided/);
  });
});

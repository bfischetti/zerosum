import { describe, expect, it } from "vitest";
import { testDb as db } from "../support/db.js";
import { groupWith, postTransaction } from "../support/fixtures.js";

describe("transaction amount", () => {
  it("accepts an expense total above its debits (payer's own share is netted)", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla", "Alex"]);
    const entries: Array<[string, number]> = [
      [a.Bruno!, -6000],
      [a.Carla!, 3000],
      [a.Alex!, 3000],
    ];
    await postTransaction(db, groupId, entries, { amount: 9000 });
  });

  it("rejects an expense total below its debits", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await expect(
      postTransaction(
        db,
        groupId,
        [
          [a.Bruno!, -3000],
          [a.Carla!, 3000],
        ],
        { amount: 2999 },
      ),
    ).rejects.toThrow(/debits 3000 but its amount is only 2999/);
  });

  it("rejects a settlement whose amount differs from what it moves", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await expect(
      postTransaction(
        db,
        groupId,
        [
          [a.Carla!, -3000],
          [a.Bruno!, 3000],
        ],
        { type: "settlement", amount: 5000 },
      ),
    ).rejects.toThrow(/moves 3000 but its amount is 5000/);
  });

  it("rejects a reversal whose amount differs from the original", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla", "Alex"]);
    const original = await postTransaction(
      db,
      groupId,
      [
        [a.Bruno!, -6000],
        [a.Carla!, 3000],
        [a.Alex!, 3000],
      ],
      { amount: 9000 },
    );
    await expect(
      postTransaction(
        db,
        groupId,
        [
          [a.Bruno!, 6000],
          [a.Carla!, -3000],
          [a.Alex!, -3000],
        ],
        { type: "reversal", reversesId: original, amount: 6000 },
      ),
    ).rejects.toThrow(/reversal amount 6000 does not match the original amount 9000/);
  });

  it("rejects a non-positive amount", async () => {
    const { groupId, accounts: a } = await groupWith(db, ["Bruno", "Carla"]);
    await expect(
      postTransaction(
        db,
        groupId,
        [
          [a.Bruno!, -1],
          [a.Carla!, 1],
        ],
        { amount: 0 },
      ),
    ).rejects.toThrow(/transactions_amount_check/);
  });
});

import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { GroupParams } from "../http/schemas.js";
import { groupBalances } from "./balances.js";

export function balanceRoutes(app: FastifyInstance, db: Db): void {
  app.get("/groups/:groupId/balances", async (req) => {
    const { groupId } = GroupParams.parse(req.params);
    return {
      groupId,
      currency: "EUR",
      note: "Amounts are integer cents. balance > 0 means the member is owed money; balance < 0 means they owe.",
      members: await groupBalances(db, groupId),
    };
  });
}

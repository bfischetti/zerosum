import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { idempotent } from "../http/idempotency.js";
import { Cents, GroupParams, Timestamp } from "../http/schemas.js";
import { groupBalances } from "../balances/balances.js";
import { planSettlements } from "./plan.js";
import { recordSettlement } from "./settlements.js";

const CreateSettlementBody = z
  .object({
    fromMemberId: z.uuid(),
    toMemberId: z.uuid(),
    amount: Cents,
    description: z.string().trim().min(1).max(500).optional(),
    occurredAt: Timestamp.optional(),
  })
  .refine((b) => b.fromMemberId !== b.toMemberId, {
    message: "a member cannot settle with themselves",
    path: ["toMemberId"],
  });

export function settlementRoutes(app: FastifyInstance, db: Db): void {
  app.post("/groups/:groupId/settlements", async (req, reply) => {
    const { groupId } = GroupParams.parse(req.params);
    const body = CreateSettlementBody.parse(req.body);
    return idempotent(db, req, reply, 201, (trx) => recordSettlement(trx, groupId, body));
  });

  app.get("/groups/:groupId/settlement-plan", async (req) => {
    const { groupId } = GroupParams.parse(req.params);
    const balances = await groupBalances(db, groupId);
    return {
      groupId,
      currency: "EUR",
      note: "Suggested settlements only; nothing is recorded. Record each payment with POST /groups/:groupId/settlements.",
      payments: planSettlements(balances),
    };
  });
}

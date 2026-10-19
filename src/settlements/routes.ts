import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { Cents, GroupParams, Timestamp } from "../http/schemas.js";
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
    const settlement = await recordSettlement(db, groupId, body);
    return reply.status(201).send(settlement);
  });
}

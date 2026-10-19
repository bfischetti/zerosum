import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { idempotent } from "../http/idempotency.js";
import { PageQuery } from "../http/pagination.js";
import { GroupParams } from "../http/schemas.js";
import { groupHistory } from "./history.js";
import { voidTransaction } from "./void.js";

const TransactionParams = z.object({ id: z.uuid() });

const VoidBody = z
  .object({ description: z.string().trim().min(1).max(500).optional() })
  .optional();

export function transactionRoutes(app: FastifyInstance, db: Db): void {
  app.post("/transactions/:id/void", async (req, reply) => {
    const { id } = TransactionParams.parse(req.params);
    const body = VoidBody.parse(req.body);
    return idempotent(db, req, reply, 201, (trx) => voidTransaction(trx, id, body?.description));
  });

  app.get("/groups/:groupId/transactions", async (req) => {
    const { groupId } = GroupParams.parse(req.params);
    const query = PageQuery.parse(req.query);
    return groupHistory(db, groupId, query);
  });
}

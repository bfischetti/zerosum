import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { PageQuery } from "../http/pagination.js";
import { memberStatement } from "./statement.js";

const StatementParams = z.object({ groupId: z.uuid(), memberId: z.uuid() });

export function statementRoutes(app: FastifyInstance, db: Db): void {
  app.get("/groups/:groupId/members/:memberId/statement", async (req) => {
    const { groupId, memberId } = StatementParams.parse(req.params);
    const query = PageQuery.parse(req.query);
    return memberStatement(db, groupId, memberId, query);
  });
}

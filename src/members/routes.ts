import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { idempotent } from "../http/idempotency.js";
import { createMember } from "./members.js";

const CreateMemberBody = z.object({
  name: z.string().trim().min(1).max(200),
});

export function memberRoutes(app: FastifyInstance, db: Db): void {
  app.post("/members", async (req, reply) => {
    const body = CreateMemberBody.parse(req.body);
    return idempotent(db, req, reply, 201, (trx) => createMember(trx, body.name));
  });
}

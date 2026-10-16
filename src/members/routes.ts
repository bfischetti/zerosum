import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { createMember } from "./members.js";

const CreateMemberBody = z.object({
  name: z.string().trim().min(1).max(200),
});

export function memberRoutes(app: FastifyInstance, db: Db): void {
  app.post("/members", async (req, reply) => {
    const body = CreateMemberBody.parse(req.body);
    const member = await createMember(db, body.name);
    return reply.status(201).send(member);
  });
}

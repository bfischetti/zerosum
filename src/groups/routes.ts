import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { createGroup } from "./groups.js";

const CreateGroupBody = z.object({
  name: z.string().trim().min(1).max(200),
});

export function groupRoutes(app: FastifyInstance, db: Db): void {
  app.post("/groups", async (req, reply) => {
    const body = CreateGroupBody.parse(req.body);
    const group = await createGroup(db, body.name);
    return reply.status(201).send(group);
  });
}

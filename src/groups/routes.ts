import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { GroupParams } from "../http/schemas.js";
import { createGroup } from "./groups.js";
import { addMemberToGroup } from "./membership.js";

const CreateGroupBody = z.object({
  name: z.string().trim().min(1).max(200),
});

const AddMemberBody = z.object({ memberId: z.uuid() });

export function groupRoutes(app: FastifyInstance, db: Db): void {
  app.post("/groups", async (req, reply) => {
    const body = CreateGroupBody.parse(req.body);
    const group = await createGroup(db, body.name);
    return reply.status(201).send(group);
  });

  app.post("/groups/:groupId/members", async (req, reply) => {
    const { groupId } = GroupParams.parse(req.params);
    const { memberId } = AddMemberBody.parse(req.body);
    const membership = await addMemberToGroup(db, groupId, memberId);
    return reply.status(201).send(membership);
  });
}

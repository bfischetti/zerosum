import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { idempotent } from "../http/idempotency.js";
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
    return idempotent(db, req, reply, 201, (trx) => createGroup(trx, body.name));
  });

  app.post("/groups/:groupId/members", async (req, reply) => {
    const { groupId } = GroupParams.parse(req.params);
    const { memberId } = AddMemberBody.parse(req.body);
    return idempotent(db, req, reply, 201, (trx) => addMemberToGroup(trx, groupId, memberId));
  });
}

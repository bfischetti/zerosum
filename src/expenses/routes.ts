import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { Cents, GroupParams, Timestamp } from "../http/schemas.js";
import { recordExpense } from "./expenses.js";

const unique = (ids: string[]) => new Set(ids).size === ids.length;

const SplitBody = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("equal"),
    memberIds: z
      .array(z.uuid())
      .min(1)
      .refine(unique, { message: "a member can appear only once" }),
  }),
  z.object({
    type: z.literal("exact"),
    shares: z
      .array(z.object({ memberId: z.uuid(), amount: Cents }))
      .min(1)
      .refine((shares) => unique(shares.map((s) => s.memberId)), {
        message: "a member can appear only once",
      }),
  }),
]);

const CreateExpenseBody = z.object({
  payerId: z.uuid(),
  amount: Cents,
  description: z.string().trim().min(1).max(500),
  occurredAt: Timestamp.optional(),
  split: SplitBody,
});

export function expenseRoutes(app: FastifyInstance, db: Db): void {
  app.post("/groups/:groupId/expenses", async (req, reply) => {
    const { groupId } = GroupParams.parse(req.params);
    const body = CreateExpenseBody.parse(req.body);
    const expense = await recordExpense(db, groupId, body);
    return reply.status(201).send(expense);
  });
}

import {
  postLedgerTransaction,
  rejectFutureOccurredAt,
  requireGroup,
  type Trx,
} from "../ledger/post.js";
import { computeShares, netExpense, type Share, type Split } from "./split.js";

export interface ExpenseInput {
  payerId: string;
  amount: number;
  description: string;
  occurredAt?: Date;
  split: Split;
}

export interface Expense {
  id: string;
  groupId: string;
  type: "expense";
  description: string;
  amount: number;
  payerId: string;
  shares: Share[];
  occurredAt: Date;
  recordedAt: Date;
}

/** Records an expense as one ledger transaction with one netted entry per member. */
export async function recordExpense(
  trx: Trx,
  groupId: string,
  input: ExpenseInput,
): Promise<Expense> {
  rejectFutureOccurredAt(input.occurredAt);

  await requireGroup(trx, groupId);

  const shares = computeShares(input.amount, input.split);
  const tx = await postLedgerTransaction(trx, {
    groupId,
    type: "expense",
    description: input.description,
    amount: input.amount,
    occurredAt: input.occurredAt,
    entries: netExpense(input.payerId, input.amount, shares),
  });

  return {
    id: tx.id,
    groupId,
    type: "expense",
    description: input.description,
    amount: input.amount,
    payerId: input.payerId,
    shares,
    occurredAt: tx.occurredAt,
    recordedAt: tx.recordedAt,
  };
}

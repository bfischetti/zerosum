import {
  postLedgerTransaction,
  rejectFutureOccurredAt,
  requireGroup,
  type Trx,
} from "../ledger/post.js";

export interface SettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  description?: string;
  occurredAt?: Date;
}

export interface Settlement {
  id: string;
  groupId: string;
  type: "settlement";
  description: string | null;
  amount: number;
  fromMemberId: string;
  toMemberId: string;
  occurredAt: Date;
  recordedAt: Date;
}

/**
 * Records a payment that already happened between two members. It is a fact,
 * so any positive amount is accepted, even more than was owed: the sender's
 * balance rises by the amount and the receiver's falls by it.
 */
export async function recordSettlement(
  trx: Trx,
  groupId: string,
  input: SettlementInput,
): Promise<Settlement> {
  rejectFutureOccurredAt(input.occurredAt);

  await requireGroup(trx, groupId);

  const tx = await postLedgerTransaction(trx, {
    groupId,
    type: "settlement",
    description: input.description ?? null,
    amount: input.amount,
    occurredAt: input.occurredAt,
    // Credit the sender, debit the receiver (entries are debit-positive).
    entries: new Map([
      [input.fromMemberId, -input.amount],
      [input.toMemberId, input.amount],
    ]),
  });

  return {
    id: tx.id,
    groupId,
    type: "settlement",
    description: input.description ?? null,
    amount: input.amount,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    occurredAt: tx.occurredAt,
    recordedAt: tx.recordedAt,
  };
}

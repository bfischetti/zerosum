export interface PlannedPayment {
  fromMemberId: string;
  toMemberId: string;
  /** Integer cents, always positive. */
  amount: number;
}

interface Position {
  memberId: string;
  /** Amount still to pay (debtor) or receive (creditor), always positive. */
  left: number;
}

/** Largest first, then member id, so the plan is deterministic. */
const byLargest = (a: Position, b: Position) =>
  b.left - a.left || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0);

/**
 * Suggests the settlements that would bring every balance in a group to zero.
 *
 * Finding the fewest payments is NP-hard in general: it amounts to splitting
 * the members into as many zero-sum subgroups as possible, a subset-sum style
 * partition problem. So this is a deliberate heuristic, not an optimum:
 *
 * 1. Exact matches first: a debtor who owes exactly what a creditor is owed
 *    pays them directly. Plain greedy can split such pairs apart.
 * 2. Greedy on the rest: the largest debtor pays the largest creditor
 *    min(debt, credit); whoever reaches zero drops out.
 *
 * Every payment zeroes at least one member, so there are at most n - 1.
 */
export function planSettlements(
  balances: Array<{ memberId: string; balance: number }>,
): PlannedPayment[] {
  const total = balances.reduce((sum, b) => sum + b.balance, 0);
  if (total !== 0) throw new Error(`balances sum to ${total}, not 0`);

  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ memberId: b.memberId, left: b.balance }))
    .sort(byLargest);
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ memberId: b.memberId, left: -b.balance }))
    .sort(byLargest);

  const payments: PlannedPayment[] = [];
  const pay = (debtor: Position, creditor: Position, amount: number) => {
    payments.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amount });
    debtor.left -= amount;
    creditor.left -= amount;
  };

  for (const creditor of creditors) {
    const match = debtors.find((d) => d.left > 0 && d.left === creditor.left);
    if (match) pay(match, creditor, creditor.left);
  }

  for (;;) {
    const debtor = debtors.filter((d) => d.left > 0).sort(byLargest)[0];
    const creditor = creditors.filter((c) => c.left > 0).sort(byLargest)[0];
    if (!debtor || !creditor) break;
    pay(debtor, creditor, Math.min(debtor.left, creditor.left));
  }

  return payments;
}

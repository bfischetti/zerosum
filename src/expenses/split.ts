import { AppError } from "../http/errors.js";

export type Split =
  | { type: "equal"; memberIds: string[] }
  | { type: "exact"; shares: Share[] };

export interface Share {
  memberId: string;
  /** Integer cents, always positive. */
  amount: number;
}

/**
 * Divides an expense among its participants. Every share is positive and the
 * shares sum to `amount` exactly.
 *
 * Equal splits hand the leftover cents out one each to participants in
 * member-id order. The order is deliberately arbitrary but stable, so the
 * same expense always splits the same way (1000 / 3 = 334, 333, 333).
 *
 * Participants are assumed unique; request validation rejects duplicates.
 */
export function computeShares(amount: number, split: Split): Share[] {
  if (split.type === "exact") {
    const total = split.shares.reduce((sum, s) => sum + s.amount, 0);
    if (total !== amount) {
      throw new AppError(
        422,
        "split_mismatch",
        `exact shares sum to ${total}, but the expense amount is ${amount}`,
      );
    }
    return split.shares.map((s) => ({ ...s }));
  }

  const n = split.memberIds.length;
  if (amount < n) {
    throw new AppError(
      422,
      "amount_too_small",
      `${amount} cents cannot be split equally among ${n} participants without a zero share`,
    );
  }
  const base = Math.floor(amount / n);
  const remainder = amount % n;
  return [...split.memberIds]
    .sort()
    .map((memberId, i) => ({ memberId, amount: base + (i < remainder ? 1 : 0) }));
}

/**
 * Nets an expense into one amount per member (ADR 0001): each participant is
 * debited their share and the payer is credited the full amount, so a payer
 * who also participates gets a single entry of `share - amount`.
 *
 * Returns amounts keyed by member id, positive meaning debit.
 */
export function netExpense(payerId: string, amount: number, shares: Share[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const s of shares) net.set(s.memberId, s.amount);
  net.set(payerId, (net.get(payerId) ?? 0) - amount);
  for (const [memberId, value] of net) if (value === 0) net.delete(memberId);
  if (net.size < 2) {
    throw new AppError(
      422,
      "payer_only_participant",
      "an expense whose only participant is the payer has no effect on the group",
    );
  }
  return net;
}

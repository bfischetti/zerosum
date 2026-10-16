# One account per member per group, with netted entries

Each member has exactly one ledger account per group, and a transaction posts at most one entry per account, so the payer of an expense gets a single netted entry (Bruno pays 9000 split three ways: Bruno −6000, Carla +3000, Alex +3000). We chose this for a natural statement, one line per member per transaction, even though it means a member's "total paid" and "total share" can't be recovered from the ledger.

## Considered Options

- **Three accounts per member (`paid`, `share`, `transfers`).** This was the original handoff proposal. It makes "total paid" and "total share" a plain sum, but the payer gets entries that partly cancel each other, the statement gets noisier, and there are three times as many account rows. Rejected.
- **One account, but the payer gets two entries (−9000 and +3000).** This keeps the totals derivable, but brings back the noise that the one-account model was meant to remove. Rejected.

## Consequences

- An expense's total can't be recovered from its entries either, so each transaction stores its headline `amount` (descriptive only; balances still come from entries).
- An expense whose only participant is the payer would net to zero and leave no entries, so it is rejected.
- Settlement entries are never netted, so Sent/Received can still be derived. They are computed from non-voided settlements only, because splitting entries by sign would count a reversal as money flowing back.
- If spending totals are ever needed, they belong in a per-expense breakdown (v2), not in the account structure.

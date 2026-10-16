# Ledger invariants are enforced in Postgres

The ledger's integrity rules are enforced by the database, not only by application code, so that no code path, script or manual `psql` session can write an invalid ledger. The rules:

- every transaction balances to zero with at least two entries (a deferred constraint trigger, checked at commit)
- `transactions` and `entries` are append-only (triggers reject UPDATE and DELETE)
- entries belong to accounts in the transaction's group (composite foreign keys on `group_id`, not a trigger)
- a transaction is a reversal exactly when `reverses_id` is set (CHECK constraint)
- a reversal cannot be voided (insert trigger)
- a transaction is voided at most once (`unique (reverses_id)`)

The one deliberate exception is that **a reversal's entries exactly mirror the original's**. This check lives in the app plus a test: only one code path writes reversals, and a deferred trigger for it would be the most complex check for the least risk. Don't "move it into the DB" or remove the triggers as "redundant with app validation" without revisiting this decision.

## Consequences

- Tests must really commit (no rollback-per-test isolation), because deferred triggers only fire at COMMIT. Tests reset with `TRUNCATE … CASCADE` and run serially.
- The append-only triggers are row-level, so `TRUNCATE` is not blocked. We accept that for v1.

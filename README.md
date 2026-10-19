# zerosum

A small shared-expenses tracker (think mini Splitwise) built on a double-entry ledger. The core rule, and the reason for the name: **every transaction's entries sum to zero.**

- Domain language: [CONTEXT.md](CONTEXT.md)
- Architecture decisions: [docs/adr/](docs/adr/)

## Getting started

Requires Node 24+, pnpm and Docker.

```bash
pnpm install
pnpm db:up            # Postgres on localhost:5433 (dev + test databases)
pnpm migrate          # migrate the dev database
pnpm seed             # optional: a sample "Lisbon trip" group, printed with its balances
pnpm dev              # API on http://127.0.0.1:3000
pnpm test             # migrates and runs against the test database
```

`DATABASE_URL`, `TEST_DATABASE_URL`, `PORT` and `HOST` override the defaults in [src/config.ts](src/config.ts).

## How it works

- Each member has one ledger **account** per group. An expense or settlement is a **transaction** with one netted **entry** per member involved ([ADR 0001](docs/adr/0001-one-account-per-member-netted-entries.md)).
- Postgres enforces the ledger's invariants: entries sum to zero at commit, the ledger is append-only, entries stay in their group, and a reversal can't be voided ([ADR 0002](docs/adr/0002-ledger-invariants-in-postgres.md)).
- Balances are always derived from entries, never stored.
- Mistakes are fixed by **voiding**, which posts a mirror-image reversal. Nothing is edited or deleted.
- Money is integer cents, EUR only.

## API

All amounts are integer cents. A **balance** is positive when the member is owed money and negative when they owe.

| Method | Path | |
|---|---|---|
| POST | `/members` | `{ name }` |
| POST | `/groups` | `{ name }` |
| POST | `/groups/:groupId/members` | `{ memberId }`; membership is permanent |
| POST | `/groups/:groupId/expenses` | `{ payerId, amount, description, occurredAt?, split }`, where `split` is `{ type: "equal", memberIds }` or `{ type: "exact", shares: [{ memberId, amount }] }` |
| POST | `/groups/:groupId/settlements` | `{ fromMemberId, toMemberId, amount, description?, occurredAt? }` |
| POST | `/transactions/:id/void` | `{ description? }`; posts the reversal |
| GET | `/groups/:groupId/balances` | `balance`, `sent` and `received` per member |
| GET | `/groups/:groupId/transactions` | Newest first; `?limit=&cursor=` |
| GET | `/groups/:groupId/members/:memberId/statement` | Oldest first, with a running balance; `?limit=&cursor=` |
| GET | `/groups/:groupId/settlement-plan` | Suggested payments that would zero every balance; records nothing |

Every `POST` needs an `Idempotency-Key` header. Repeating a request with the same key replays the stored response (with `Idempotent-Replayed: true`). Reusing a key for a different request returns 422.

Errors look like `{ "error": { "code", "message", "details"? } }`: 400 for malformed input, 404 for unknown resources, 409 for conflicts (`already_member`, `already_voided`) and 422 for rule violations (`split_mismatch`, `not_a_member`, `payer_only_participant`, …).

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and stay small. See [CLAUDE.md](CLAUDE.md) for the project's conventions.

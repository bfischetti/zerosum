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
pnpm dev              # API on http://127.0.0.1:3000
pnpm test             # migrates and runs against the test database
```

`DATABASE_URL`, `TEST_DATABASE_URL`, `PORT` and `HOST` override the defaults in [src/config.ts](src/config.ts).

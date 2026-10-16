# zerosum

Shared-expenses tracker on a double-entry ledger. Open source.

- Domain language lives in [CONTEXT.md](CONTEXT.md); decisions in [docs/adr/](docs/adr/). Use the glossary's terms in code, tests and commit messages.

## Commits

This is a rule, not a preference:

- **Small, focused commits.** One logical change per commit (one migration, one endpoint, one fix). Don't bundle unrelated changes; don't save everything for one big commit at the end.
- **Conventional Commits** for every message: `type(scope): summary`
  - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `perf`
  - Scope is optional, e.g. `feat(expenses): …`, `test(ledger): …`
  - Summary in the imperative, lower case, no trailing period, ≤ 72 chars
  - Add a body when the *why* isn't obvious from the summary
- Each commit should leave the repo in a working state (typecheck and tests pass).

## Conventions

- Money is integer cents (`bigint`), EUR only. Never floats.
- All ledger writes happen inside a single DB transaction.
- Balances are always derived from entries; no stored balance columns.
- Prefer clear SQL over clever SQL.
- Tests run against a real Postgres (`pnpm db:up`), never DB mocks.

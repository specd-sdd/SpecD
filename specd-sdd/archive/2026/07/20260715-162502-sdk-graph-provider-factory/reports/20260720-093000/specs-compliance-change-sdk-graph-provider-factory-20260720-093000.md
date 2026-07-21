# Full compliance audit — sdk-graph-provider-factory

## Result

Not clean. Verification hooks, root tests, lint, typecheck, and build pass, but the full audit found two implementation/spec gaps that require follow-up.

## Findings

1. **HIGH — `graph stats` bootstrap is inconsistent.** `stats.ts` owns SDK host bootstrap as required by `cli:graph-cli-context`, but `--path` and no-config flows call `openSpecdHost({ startDir })`, which performs config discovery instead of the specified synthetic graph bootstrap. The merged `cli:graph-stats` artifact also retains stale wording that says stats goes through the shared graph CLI context. Resolution requires specs and implementation.
2. **MEDIUM — Ladybug spec search omits strong identity candidates outside FTS.** SQLite now unions identity candidates, but `LadybugGraphStore.searchSpecs()` only queries FTS. A suffix/component spec-ID match missed by FTS cannot be ranked or returned. Resolution is implementation plus a regression test (or, if intentional, a spec narrowing).
3. **LOW — Ladybug document search scans documents rather than using its documented FTS structure.** Observable results work, but the adapter does not meet the stated full-text implementation wording. This predates the delta; decide whether to repair or clarify the spec.

## Verified compliant

- 67/67 composition and VCS scenarios evaluated by the focused audit passed.
- SDK lifecycle and all other inspected CLI routes passed their merged requirements.
- GraphStore API renames and SQLite identity fallback/ranking passed; SQLite suite reported 87/87 assertions passing.

## Test evidence

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed.
- Core, CLI, SDK, and code-graph suites passed their assertions. The code-graph runner intermittently emits a post-run `ERR_IPC_CHANNEL_CLOSED` worker warning; this is test-runner hygiene but prevents calling the focused runner output fully clean.

## Detailed partial audits

- `_partial-graph-composition.md` — complete composition/VCS audit.
- `_partial-graph-stores.md` — complete GraphStore/SQLite/Ladybug audit.
- `_partial-sdk-cli.md` — complete SDK/CLI audit.

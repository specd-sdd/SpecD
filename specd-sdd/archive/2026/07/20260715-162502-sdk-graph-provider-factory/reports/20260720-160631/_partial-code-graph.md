# Spec-compliance audit — code-graph batch

- Change: `sdk-graph-provider-factory`
- Scope requested: `code-graph:composition`, `code-graph:index-project-graph`, `code-graph:get-graph-health`, `code-graph:graph-store`, `code-graph:ladybug-graph-store`, and `code-graph:sqlite-graph-store` (six IDs were supplied, despite the request referring to seven specs).
- Graph: fresh (`lastIndexedAt 2026-07-19T17:45:36.355Z`, `stale: false`).
- Sources: merged change previews; direct dependencies and applicable global architecture, conventions, testing, docs, and ESLint specifications; graph search/impact; source and tests.

## Requirements summary and implementation status

| Spec                             | Status                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `code-graph:composition`         | Compliant, with one missing focused scenario                      | `createCodeGraphProvider` builds the additive `ladybug`/`sqlite` registry, defaults to `sqlite`, registers four built-in adapters, returns only the type-level provider facade, and defers native loads to stores' `open()`. `public.ts` and `package.json` expose curated `.` and `./internal` surfaces. `CodeGraphProviderImpl` keeps lock/recreate internals private, gates use before/after open, and makes close idempotent. |
| `code-graph:index-project-graph` | **Artifact/code drift**                                           | `IndexProjectGraph.execute()` correctly forwards all stated fields and `force` without opening, closing, locking, or directly recreating. However `IndexProjectGraphInput` also requires and forwards `vcsRoot: string                                                                                                                                                                                                            | null`; the merged spec's complete input contract and its forwarded `IndexOptions` field list omit it. |
| `code-graph:get-graph-health`    | Compliant                                                         | The use case obtains availability through `provider.getStatistics()`, propagates provider errors, resolves VCS ref defensively, uses `isGraphStale`, and performs fingerprint comparison only when inputs permit. It neither mutates nor owns provider lifecycle.                                                                                                                                                                 |
| `code-graph:graph-store`         | Compliant, coverage incomplete for failure/parallel-process cases | `GraphStore` is an abstract domain port; provider owns force recreation/locking and generation checks. Both concrete stores implement lifecycle, storage generation, documents, queries, mutation methods, FTS, and statistics. Contract tests exercise the shared semantics.                                                                                                                                                     |
| `code-graph:ladybug-graph-store` | Compliant by static inspection and contract coverage              | The adapter dynamically imports `lbug` during `open()`, stores under the backend-owned graph root, implements recreation/generation methods, and participates in the shared contract suite.                                                                                                                                                                                                                                       |
| `code-graph:sqlite-graph-store`  | Compliant by static inspection and contract coverage              | The adapter dynamically imports `better-sqlite3` during `open()`, has SQLite transactions/recreation/generation tracking, and its dedicated suite covers persistence, FTS, recreation, and shared contract behavior.                                                                                                                                                                                                              |

## Detailed finding

### CG-01 — IndexProjectGraph public input contract is stale relative to implementation

- Severity: medium (public TypeScript API/documentation drift; no observed runtime failure).
- Spec evidence: `code-graph:index-project-graph` states that the `IndexOptions` output is built from `projectRoot`, `workspaces`, `graphConfig`, `codeGraphVersion`, optional `vcsRef`, and optional `onProgress`. Its exhaustive `IndexProjectGraphInput` list also omits `vcsRoot`.
- Code evidence: `packages/code-graph/src/application/use-cases/index-project-graph.ts` declares required `vcsRoot: string | null` and forwards `vcsRoot: input.vcsRoot` to `provider.index()`. `IndexOptions` itself requires that field, and production/tests construct it.
- Interpretation: the implementation is internally coherent, likely because file discovery needs the VCS root. The merged spec is the stale side unless `vcsRoot` should be removed/refactored from the lower index contract. Either way, the two contracts must be aligned.
- Recommendation: update `code-graph:index-project-graph` to specify required `vcsRoot: string | null` and that it is forwarded, or intentionally change the implementation and `IndexOptions` API to derive it elsewhere.

## Test coverage

- Targeted command: `pnpm --filter @specd/code-graph test`.
- Observed passing suites include composition provider (12 tests), health (8), index-project-graph (3), host-use-case factories (4), SQLite store (87), and broad domain/application suites.
- The command did not produce a normal final completion summary: after the observed passing suites it emitted an unhandled `ERR_IPC_CHANNEL_CLOSED` (`Channel closed`) from Vitest/tinypool. Treat the broad run as **inconclusive**, not a clean full-suite pass; rerun in a stable worker configuration before relying on it as release evidence.
- Existing focused coverage: factory registry/default selection, lifecycle guards/idempotence, force forwarding, health outcomes, shared store contract, SQLite persistence/recreation/FTS, and Ladybug persistence/FTS are covered.

## Missing or weak tests

1. Add an `IndexProjectGraph` test asserting the required `vcsRoot` field is forwarded; that would make CG-01 visible if spec/API changes diverge again.
2. Add provider-level tests for cross-process storage-generation invalidation and busy-lock error propagation; current code has the behavior but this batch did not identify a focused provider scenario for it.
3. Add backend-specific negative transaction tests that inject a failed `upsertFile`/bulk mutation and prove prior persisted state remains intact for both SQLite and Ladybug. The shared contract currently verifies replacement behavior, not an induced rollback for both adapters.
4. Stabilize or diagnose the Vitest worker `ERR_IPC_CHANNEL_CLOSED` before treating the package test command as a reliable exit gate.

## Dependency and global-spec conformance

- Architecture: `GraphStore` is in `domain/ports`; SQLite and Ladybug are infrastructure adapters; composition creates stores and provider. This matches hexagonal direction.
- Public API: the public barrel is curated and keeps `CodeGraphProvider` type-only, while package exports provide `.` and `./internal`; concrete stores and provider implementation do not leak from `.`.
- Conventions/ESLint: the inspected changed-path symbols use ESM imports, named exports, explicit signatures, and JSDoc. No contradictory global-spec requirement was found in the audited scope.
- Testing: unit/contract/infrastructure test structure is present; the gaps above concern scenario depth and runner reliability rather than absence of tests.
- Docs: no new user-facing CLI/MCP contract was audited in this batch. The `IndexProjectGraphInput` mismatch is package API/spec documentation drift, not a docs-directory finding.

## Summary counts

- Specs audited: 6
- Confirmed implementation/spec discrepancies: 1 (CG-01)
- Global/dependency contradictions: 0
- Test-coverage gaps: 4
- Test execution blockers: 1 (`ERR_IPC_CHANNEL_CLOSED`; broad run inconclusive)

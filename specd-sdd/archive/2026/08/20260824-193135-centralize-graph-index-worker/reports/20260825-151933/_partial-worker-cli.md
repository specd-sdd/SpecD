# Compliance audit partial — worker/public composition/SDK/CLI

Change: `centralize-graph-index-worker`  
Scope: `code-graph:isolated-index-worker`, `code-graph:composition`,
`sdk:composition`, and `cli:graph-index` (including their direct boundaries).

## Evidence reviewed

- Merged change previews for the four owned specs and their verification scenarios.
- Public/composition code: `run-isolated-graph-index.ts`, the isolated-worker
  supervisor and protocol tests, `sdk/src/index.ts`,
  `sdk/src/orchestration/run-index-project-graph.ts`,
  `cli/src/commands/graph/index-graph.ts`, and `cli/src/graph-index-task.ts`.
- Package boundaries: CLI and SDK `package.json`, code-graph public exports, and
  `docs/cli/cli-reference.md`.
- Graph status: reports `current`, but only `fileCount: 1` / `symbolCount: 3` for
  1,106 indexed source files. Symbol/impact evidence is therefore unusable; this
  audit used the permitted direct-file fallback.
- Test command executed: `pnpm --filter @specd/cli test -- graph-index.spec.ts
graph-index-integration.spec.ts graph-index-task.spec.ts` — 81 files / 869 tests
  passed. The command then began the code-graph worker subset; its final result was
  not observable from this isolated audit invocation, so it is not counted as fresh
  passing evidence here.

## Requirement-to-implementation assessment

| Area                                                         | Status             | Evidence                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High-level worker API, no host `exit`/formatting             | Pass               | `runIsolatedGraphIndex` is a public code-graph façade; the CLI alone owns formatting and exit status.                                                                                      |
| Lock ownership, fork, validated protocol, signal/IPC cleanup | Pass (test-backed) | Supervisor encapsulates these internals; worker tests cover progress, duplicate terminals, clean premature exit, and failed initial send.                                                  |
| Published ESM worker and trusted built task                  | Pass               | Module-relative child URL; code-graph build emits child; `dist.spec.ts` verifies built tasks and clean forced repeats.                                                                     |
| Code-graph curated public surface                            | Pass               | Public barrels expose only high-level worker contracts; raw locks/protocol/child adapter remain internal.                                                                                  |
| SDK curated worker surface and layering                      | Pass               | SDK root re-exports the host-facing types/errors and no raw lock/IPC; package stays dependent on core/code-graph only. Narrow `domain/` and private `shared/` conform to merged scenarios. |
| CLI-to-SDK-only boundary                                     | Pass               | CLI imports `runIsolatedGraphIndex` from SDK, carries a serializable descriptor, and has no `@specd/code-graph` dependency.                                                                |
| CLI child task reconstruction                                | Pass               | `graph-index-task.ts` explicitly reconstructs configured/bootstrap SDK context and calls `runIndexProjectGraph` once.                                                                      |
| Force/recovery behavior through packaged child               | Pass               | Integration tests exercise repeated force, no lock residue, forced corrupt-store recovery, and non-force preservation.                                                                     |
| CLI format/progress neutrality                               | Pass               | Text parent renders progress; JSON/TOON omit callback. Integration tests parse one structured final result with no IPC/progress contamination.                                             |
| CLI reference repair explanation                             | Pass               | `docs/cli/cli-reference.md` documents logical `--force`, typed one-shot recovery, non-force preservation, and no native crash hang.                                                        |

## Discrepancies and risks

### D-1 — Workflow artifact review is currently required (blocker, not an implementation defect)

Fresh `changes status` reports state `designing`, every change artifact as
`pending-review`, and blocker `REVIEW_REQUIRED`. This is a lifecycle gate and makes a
verification-to-done transition invalid until the modified artifacts are semantically
reviewed/revalidated. It appears consistent with recent in-flight edits; it is not
evidence that the worker implementation violates a requirement.

### D-2 — No independently observed final result for this audit's code-graph worker subset (coverage gap)

The CLI focused suite completed successfully. The subsequent code-graph worker subset
was started by the combined command but the executor returned before its terminal
summary was available. Existing change history records worker/package tests and global
hooks as passing, but this partial does not treat that history as a replacement for a
fresh result. Re-run the focused code-graph worker tests (or the repository test hook)
before declaring the audit's test evidence fully fresh.

### D-3 — Code-graph index content is materially underpopulated despite a “current” state (tooling-health risk)

`graph stats` reports a current, coverage-complete graph while reporting only one source
file and three symbols. This prevents graph-based impact verification for the changed
implementation. The requirement surface itself is not contradicted by source review or
tests, but the graph index's freshness/coverage reporting should be investigated outside
this change if reproducible.

No implementation/spec contradiction was found in the assigned four-spec scope.

## Test coverage and remaining gaps

- Covered: CLI delegation, descriptor serialization, bootstrap/configured paths,
  structured-output cleanliness, force runs, lock release, corruption recovery,
  busy-lock exit, public-barrel boundaries, worker terminal/protocol behaviors, and
  built worker task fixtures.
- Useful additional hardening (non-blocking): a real CLI subprocess test that injects
  each typed worker failure class (startup/protocol/signal/task) and asserts the exact
  existing code-3 presentation path, rather than relying primarily on the command unit
  mock. Current behavior is unit-covered generically and architecture-compliant.

## Dependency consistency

- CLI -> SDK -> code-graph follows the declared no-direct-code-graph CLI dependency.
- The isolated worker remains code-graph-owned; CLI's packaged task is selected
  programmatically and executes SDK orchestration.
- SDK's `runIndexProjectGraph` owns force/open-error recovery; provider recreation is
  closed-only and does not leak into the CLI or worker API.
- Documentation and CLI semantics agree that force is logical reindexing, with physical
  recreation reserved for typed recoverable open failure.

## Summary counts

- Requirements assessed: 10 grouped areas
- Passing/aligned: 10
- Implementation defects: 0
- Spec contradictions: 0
- Blocking lifecycle findings: 1 (`REVIEW_REQUIRED`)
- Evidence/tooling risks: 2 (unobserved focused terminal result; underpopulated graph)
- Non-blocking test hardening suggestions: 1

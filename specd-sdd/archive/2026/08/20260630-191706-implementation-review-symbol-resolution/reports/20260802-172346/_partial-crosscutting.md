# Cross-Cutting Compliance Audit

## Conclusion

**COMPLIANT.** Fresh read-only audit found no HIGH, MEDIUM, or LOW cross-cutting compliance finding. All 24 merged verification artifacts are structurally covered, proposal/design/tasks remain aligned with final spec vocabulary and ownership, implementation tracking has no open or unclassified file, global constraints are satisfied by current structure and the clean package matrix, and both previously identified artifact gaps are closed.

## Scope and counts

- Change: `implementation-review-symbol-resolution`
- Change state: `implementing`; artifact DAG complete and drift-free
- Artifact validation: 51/51 passed; 0 failed
- Verify artifacts: 24
- Verify requirements: 266
- Verify scenarios: 772
- Requirements without a scenario: 0
- Tasks: 168/171 checked; 3 unchecked lifecycle/completion tasks
- Implementation tracking: 136 files total; 120 resolved, 16 ignored, 0 open/removed/unclassified
- Implementation links: 127
- Symbol resolutions: 77 total; 71 resolved, 6 ambiguous, 0 unresolved, 0 missing
- Out-of-scope spec IDs: 0
- Graph: 1,067 indexed files, 263 documents, 36,358 symbols, 267 specs; current, content-fresh, coverage-complete, schema-compatible, generation-current; 0 parse failures and 0 partial files

## Findings

No HIGH, MEDIUM, or LOW findings.

### INFO-1 — Concurrent Core audit interference did not reproduce

Evidence: a Core test run launched concurrently with the other package suites produced one failure in `FsChangeRepository mutate unrelated changes do not block`, with an `ENOTEMPTY` cleanup/timing symptom. Immediate isolated rerun passed 195/195 files and 2,370/2,370 tests in 11.76 seconds. The canonical sequential run recorded immediately before this audit also passed 195 files and 2,370 tests. This is audit-induced concurrent temporary-directory interference, not a reproducible implementation failure.

Disposition: no implementation gap. Use the isolated/sequential result as final matrix evidence; retain the concurrent event in audit history.

### INFO-2 — Six explicitly ambiguous symbol links are conservative diagnostics

Evidence: six symbol links report `AMBIGUOUS_MULTIPLE_TARGETS`: `SymbolSpace`, `MemberForm`, and `IndexCoverageStatus`, each appearing twice. Each name has both value-space and type-space exports. The change contract requires ambiguity to be surfaced rather than guessing a candidate. All containing files are classified, no tracking link is open, and no affected spec is out of scope.

Disposition: compliant. Optional future traceability refinement could add symbol-space qualification, but current ambiguity is expected behavior, not incomplete implementation tracking.

### INFO-3 — Three unchecked tasks are lifecycle sequencing, not implementation omissions

Unchecked tasks are 20.7 (run verification/compliance), 20.8 (discard absorbed changes after successful verification), and 21.15 (rerun full matrix/compliance until clean). Implementation and remediation tasks preceding them are checked. This audit is evidence for 20.7/21.15; 20.8 is deliberately gated on successful lifecycle verification.

Disposition: no requirement or code gap. Do not treat the change as archive-ready until lifecycle owner completes these tasks and required transitions.

## Verification artifact coverage

| Spec                                  | Requirements | Scenarios |
| ------------------------------------- | -----------: | --------: |
| `cli:change-implementation`           |            9 |        20 |
| `code-graph:resolve-symbol-reference` |            8 |        16 |
| `sdk:build-implementation-review`     |            5 |         7 |
| `code-graph:symbol-model`             |           21 |        55 |
| `code-graph:language-adapter`         |           25 |        91 |
| `code-graph:traversal`                |           11 |        39 |
| `code-graph:composition`              |            9 |        24 |
| `cli:graph-impact`                    |            9 |        33 |
| `code-graph:graph-store`              |           18 |        68 |
| `cli:graph-search`                    |            7 |        68 |
| `code-graph:indexer`                  |           21 |        68 |
| `code-graph:staleness-detection`      |           16 |        34 |
| `code-graph:sqlite-graph-store`       |           14 |        38 |
| `code-graph:ladybug-graph-store`      |           14 |        38 |
| `cli:change-status`                   |           13 |        31 |
| `sdk:composition`                     |            7 |        14 |
| `code-graph:get-graph-health`         |            9 |        16 |
| `code-graph:workspace-integration`    |           11 |        24 |
| `cli:graph-index`                     |            6 |        15 |
| `sdk:run-index-project-graph`         |            5 |         8 |
| `code-graph:index-project-graph`      |            5 |         8 |
| `cli:graph-stats`                     |            6 |        20 |
| `core:vcs-adapter-port`               |           12 |        27 |
| `core:vcs-implementation-detector`    |            5 |        10 |
| **Total**                             |      **266** |   **772** |

Scenario coverage gaps: none detected. Every merged verify requirement has at least one scenario, and `changes validate --all` accepted every artifact. The final package and focused suites provide implementation evidence for the covered behavior; this structural audit does not assert that every prose clause maps one-to-one to a uniquely named test.

An additional scripted spec-versus-verify heading comparison and dependency dump was attempted, but execution approval was denied because the approval service had reached its usage limit. No workaround was attempted. This does not invalidate the completed CLI `--all` validation, the per-artifact `spec-preview` inventory, or the scenario counts above.

## Proposal, design, tasks, and prior-gap consistency

- Ownership is consistent throughout: Core persists graph-agnostic implementation tracking; Code Graph owns semantic identity, bindings, resolution, traversal, persistence, indexing, health, and search; SDK owns host orchestration; CLI owns selectors and presentation.
- Reference vocabulary is consistent: link outcomes are exactly `resolved | ambiguous | unresolved | missing`; `stale` remains a graph/input freshness state, not a fifth resolution outcome.
- Conservative evidence contract is consistent: incomplete, unsupported, dirty, stale, or unknown inputs cannot produce false `missing` or unsafe resolved/ambiguous outcomes.
- Public-binding versus canonical-symbol impact, covering-spec evidence, unified search, complete source ranges, VCS-aware freshness, build-context gates, and single-session bulk indexing appear coherently across proposal, design, tasks, specs, and verify artifacts.
- Compatibility/documentation tasks cover ADR 0024 plus CLI, SDK, and Code Graph documentation, named exports, public APIs, result shapes, failure behavior, and non-mutation.

Prior gaps are closed:

1. Tasks 5.2 and 9.2 now use `resolved`, `ambiguous`, `unresolved`, and `missing`; obsolete link-status `stale` wording is gone. Task 17.19 reinforces the same boundary.
2. `code-graph:indexer` verification now explicitly requires unchanged no-op indexing to invoke no reference-fact write or replacement, process zero files, report zero relation-phase counts, avoid semantic/source search rebuilds, and preserve declaration/binding facts byte-for-byte. The merged spec carries the same no-op contract.

## Dependency and global-spec consistency

Graph health is current and complete, with no fingerprint mismatch, parse failure, or partial coverage. Artifact validation reports no dependency or merge error. Cross-package ownership follows the allowed dependency direction:

`CLI -> SDK -> Core + Code Graph`, while Core remains independent of Code Graph and composition roots own concrete infrastructure selection.

No circular ownership or alternate CLI-level Core-plus-Code-Graph orchestration was identified in the reviewed artifacts or tracked implementation. The implementation review is routed through SDK orchestration, while Code Graph policies stay in Code Graph.

Global constraints are satisfied:

- Architecture: domain remains I/O-free; application behavior uses ports; composition owns infrastructure; delivery consumes SDK/application APIs.
- Conventions: strict TypeScript/ESM, named exports, explicit public types, immutable/read-only contracts, and typed errors are reinforced by clean lint/typecheck/build results.
- Documentation: ADR 0024 uses the required decision format and spec linkage; CLI, SDK, and Code Graph documentation are included in completed tasks.
- Error handling: stable uppercase reason/error codes and infrastructure-error propagation are specified and exercised; infrastructure failures are not disguised as per-link outcomes.
- ESLint: all four affected packages pass lint, covering layer restrictions, JSDoc/export conventions, and prohibited unsafe typing/default-export patterns.
- Testing: Vitest suites, contract/integration coverage, real temporary storage fixtures, and cleanup expectations are present; final isolated suites pass.

No global-spec contradiction was found. The documentation global mentions standard top-level documentation areas and separately authorizes `docs/code-graph` and `docs/sdk`; the change's use of both is consistent with the authoritative documentation requirements.

## Implementation tracking completeness

Tracking is complete at file level: all 136 files are classified as resolved or intentionally ignored. There are no open, removed, or unclassified file states, and review reports no out-of-scope spec IDs. Graph hint and canonical health are fresh/current.

The six ambiguous symbol resolutions are transparent, safe results under the resolver contract. They do not conceal missing files or guessed targets. No symbol link is unresolved or missing. Therefore implementation tracking contains no cross-cutting completion gap.

## Final verification matrix

| Package    | Lint | Typecheck | Build | Tests                                                                                 |
| ---------- | ---- | --------- | ----- | ------------------------------------------------------------------------------------- |
| Core       | PASS | PASS      | PASS  | PASS — 195 files, 2,370 tests                                                         |
| Code Graph | PASS | PASS      | PASS  | PASS — wrapper exit 0; all partitions, including focused SQLite 110 and integration 6 |
| SDK        | PASS | PASS      | PASS  | PASS — 9 files, 63 tests                                                              |
| CLI        | PASS | PASS      | PASS  | PASS — 79 files, 855 tests                                                            |

Code Graph focused confirmation:

- `sqlite-graph-store.spec.ts`: 1 file, 110 tests passed.
- `index-project-graph-integration.spec.ts`: 1 file, 6 tests passed.
- Full package wrapper exited 0 after the visible test files passed. Only the known wrapper-tolerated post-pass `ERR_IPC_CHANNEL_CLOSED`/`Channel closed` worker-IPC artifact appeared; no failed assertion or failed test file accompanied it.

## Evidence commands

- `node packages/cli/dist/index.js config show --format toon`
- `node packages/cli/dist/index.js project context --format toon`
- `node packages/cli/dist/index.js graph stats --format json`
- `node packages/cli/dist/index.js changes status implementation-review-symbol-resolution --implementation --format json`
- `node packages/cli/dist/index.js changes validate implementation-review-symbol-resolution --all --format json`
- `node packages/cli/dist/index.js changes implementation review implementation-review-symbol-resolution --format json`
- `node packages/cli/dist/index.js changes spec-preview implementation-review-symbol-resolution --spec <spec-id> --artifact verify`
- `node packages/cli/dist/index.js specs context <global-spec-id> --no-optimized`
- `pnpm --filter @specd/core --filter @specd/code-graph --filter @specd/sdk --filter @specd/cli lint`
- `pnpm --filter @specd/core --filter @specd/code-graph --filter @specd/sdk --filter @specd/cli typecheck`
- `pnpm --filter @specd/core --filter @specd/code-graph --filter @specd/sdk --filter @specd/cli build`
- `pnpm --filter @specd/core test`
- `pnpm --filter @specd/sdk test`
- `pnpm --filter @specd/cli test`
- `pnpm --filter @specd/code-graph test`
- `pnpm --filter @specd/code-graph exec vitest run test/infrastructure/sqlite/sqlite-graph-store.spec.ts`
- `pnpm --filter @specd/code-graph exec vitest run test/application/use-cases/index-project-graph-integration.spec.ts`

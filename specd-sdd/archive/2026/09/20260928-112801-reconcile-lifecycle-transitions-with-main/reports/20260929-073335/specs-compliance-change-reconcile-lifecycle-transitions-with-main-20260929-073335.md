# Spec compliance report — reconcile-lifecycle-transitions-with-main

Mode: delegated change audit  
Verification attempt: `verification-attempt-1` (owned by `specd-verify`)  
Generated: 2026-09-29  
Verdict: **PASS WITH TEST-GAP ADVISORIES**

## Executive Summary

The merged implementation conforms to the 15 change specs and their reviewed global/direct dependency contracts. No product-code/spec contradiction, semantic-spec conflict, critical finding, or high-severity finding was found.

The audit reviewed **232 requirements** and **658 verification scenarios**. Focused audit runs contributed **807 passing tests**, in addition to the outer full repository test, lint, typecheck, and build gates.

Four non-blocking test-evidence advisories remain:

- **3 MEDIUM:** Windows move/containment fault injection, atomic index-pair failure injection, and explicit indexer error-isolation coverage.
- **1 LOW:** strengthen full prepared-input forwarding assertion for `IndexProjectGraph`.

## Aggregate Results

| Metric                          | Result |
| ------------------------------- | -----: |
| Specs audited                   |     15 |
| Requirements reviewed           |    232 |
| Scenarios reviewed              |    658 |
| Focused tests passed            |    807 |
| Product-code discrepancies      |      0 |
| Critical findings               |      0 |
| High findings                   |      0 |
| Medium test-evidence advisories |      3 |
| Low test-evidence advisories    |      1 |
| Recommended missing tests       |      6 |

## Decision Guidance

The implementation and specs are conformant. The findings are evidence-strength gaps, not observed failures. They can be addressed now by adding tests, deferred as follow-up work, or explicitly dismissed before the outer verifier completes the attempt.

## Detailed Findings

# Delegated compliance audit — core lifecycle

Change: `reconcile-lifecycle-transitions-with-main`  
Verification attempt: `verification-attempt-1` (owned by the outer verifier)  
Scope: `core:hook-execution-model`, `core:change`, `core:transition-change`, `core:run-step-hooks`, `core:change-manifest`

## Requirements Summary

The merged previews define 96 requirements and 266 explicit verification scenarios:

| Spec                        | Requirements | Scenarios | Result     |
| --------------------------- | -----------: | --------: | ---------- |
| `core:hook-execution-model` |           12 |        41 | Conformant |
| `core:change`               |           30 |       102 | Conformant |
| `core:transition-change`    |           29 |        69 | Conformant |
| `core:run-step-hooks`       |           16 |        31 | Conformant |
| `core:change-manifest`      |            9 |        23 | Conformant |

The audited contracts cover hook entry forms and dispatch, phase/failure policy, lifecycle and approval semantics, implementation tracking, validity projections, state-independent verification attempts, transition orchestration, manifest v2 compatibility, deterministic fingerprints, tracked filename normalization, and atomic persistence.

## Implementation Status

### `core:hook-execution-model`

**Implemented.** `RunStepHooks` filters executable entries to `run` and `external`, leaving `instruction` passive (`packages/core/src/application/use-cases/run-step-hooks.ts:209-216`). External hooks are dispatched through the accepted-type runner map and unknown types use a typed error (`run-step-hooks.ts:301+`). Shell hooks receive developer text unchanged and a constrained template variable map; archived hooks add `archivedName` but neither active nor archived paths derive a singular workspace (`run-step-hooks.ts:146-152,196-199`). Pre failures stop the loop while post failures accumulate (`run-step-hooks.ts:227-291`).

Transition hook behavior is binding-driven: `TransitionChange` evaluates predicates first, selects `matchingEffects`, passes skip selectors through the shared execution context, and persists only after before-persist effects succeed (`packages/core/src/application/use-cases/transition-change.ts:234-344`). This matches the merged requirement that source post and target pre effects execute before persistence, use binding `onFailure`, and are not launched by check id. Archive behavior is covered by the direct dependency and its focused tests.

Host-shell quote translation and verbatim substitution are implemented at the `HookRunner` boundary (`packages/core/src/infrastructure/node/hook-runner.ts`) and exercised independently.

### `core:change`

**Implemented.** The entity owns immutable identity, canonicalized spec scope, derived workspaces, lifecycle history, implementation tracking, approval/signoff/verification projections, artifact state, invalidation evidence, and archive failure history (`packages/core/src/domain/entities/change.ts`). The implementation tracking timestamp is historical rather than state-derived (`change.ts:598-614,728-734`), entering implementing activates it (`change.ts:915-926`), and verification attempt start/completion are explicit operations independent of lifecycle transitions (`change.ts:1320-1410`). Spec IDs are deduplicated and workspace identity is derived from them rather than persisted as a primary workspace (`change.ts:461,545-556`).

No layer violation was found: domain behavior remains pure, while dependency-aware lifecycle interpretation, reconciliation, storage and hook execution remain in domain services/application/infrastructure respectively.

### `core:transition-change`

**Implemented.** The use case performs canonical validity reconciliation before requested-edge evaluation, optionally refreshes tracking, resolves `next` through the domain happy path, evaluates the shared predicate registry, maps typed failures, executes matching effects, rechecks readiness where required, mutates through the repository serialization boundary, and emits progress (`packages/core/src/application/use-cases/transition-change.ts`). Approval gates are constructor configuration, not mutable execution flags. `skipHookPhases` affects effects only, and `allowOutOfScope` remains explicit. Verification evidence is checked but neither started nor completed by a transition.

The implementation delegates lifecycle legality to the entity and check semantics to composed bindings; it does not recreate a private lifecycle table. The persisted transition occurs after successful effect execution (`transition-change.ts:284-344`).

### `core:run-step-hooks`

**Implemented.** Constructor ports, active/archive lookup, schema-name guard, valid-state resolution, executable hook collection, `--only` behavior, progress relay, external dispatch, variables, failure policy and result aggregation are all present in `packages/core/src/application/use-cases/run-step-hooks.ts`. Composition factories and accepted-type indexing are present in the composition layer (`packages/core/src/composition/use-cases/run-step-hooks.ts`, `packages/core/src/composition/composition-registries.ts:137-150`).

### `core:change-manifest`

**Implemented.** `FsChangeRepository` writes manifest version 2, serializes projections and append-only events, adapts legacy manifests conservatively, rejects unsupported future versions, normalizes implementation paths and tracked artifact filenames under representation-preserving rules, and uses `writeFileAtomic` (`packages/core/src/infrastructure/fs/change-repository.ts:69,1302+,1668,1845-1880`). Verification attempt/completion events are explicitly serialized, lifecycle remains history-derived, and the manifest does not persist a top-level lifecycle state.

The repository keeps `manifestVersion`, current projections and historical evidence distinct. Its tests cover legacy no-version reads without eager migration, unsupported future versions, scope-bearing approval fingerprints, archive failure history, direct/delta filename decisions, normalization guards and atomic writes.

## Discrepancies

No blocking, major, minor, or informational spec/implementation discrepancy was found in the assigned scope.

| Severity | Count | Evidence                                                   |
| -------- | ----: | ---------------------------------------------------------- |
| Critical |     0 | No safety, persistence, or lifecycle contradiction found   |
| High     |     0 | Predicate/effect timing and verification ownership conform |
| Medium   |     0 | Manifest compatibility and projection semantics conform    |
| Low      |     0 | No undocumented observable mismatch found                  |

The merged change specs are also semantically compatible with the inspected global and direct dependency specs. In particular:

- `default:_global/architecture` agrees with the domain/application/infrastructure split and manual dependency injection.
- `core:transition-checks` agrees that hooks are effects selected by `from`/`to`/`along`, with phase and failure policy supplied by bindings.
- `core:workflow-model` and `core:lifecycle-engine` agree on domain lifecycle states, requires gating, happy-path resolution and centralized lifecycle verdicts.
- `core:schema-format`, `core:external-hook-runner-port`, `core:hook-runner-port` and `core:template-variables` agree on the three exclusive hook forms, accepted-type dispatch, shell-only `HookRunner`, verbatim substitution and absence of a singular change workspace token.
- `core:change-layout`, `core:storage` and `core:spec-id-format` agree on canonical workspace-qualified artifact paths, authoritative tracked filenames, confinement and manifest persistence.
- `core:refresh-implementation-tracking`, `core:implementation-detector-port` and `core:count-tasks` agree on orchestration boundaries and do not leak detection/counting into the entity.

## Test Coverage

Focused execution completed successfully:

```text
Test Files  7 passed (7)
Tests       385 passed (385)
Duration    7.18s
```

Executed files:

- `packages/core/test/application/use-cases/transition-change.spec.ts` — 95 declared tests plus parameterized cases; transition predicates/effects, approvals, reconciliation, hooks, retry/redesign, tracking and verification evidence.
- `packages/core/test/application/use-cases/run-step-hooks.spec.ts` — 33 declared tests; lookup, filtering, external runners, progress, template variables and fail-fast/fail-soft behavior.
- `packages/core/test/domain/entities/change.spec.ts` — 116 declared tests; lifecycle, events, artifacts, tracking, approvals and verification projections.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts` — 108 declared tests; manifest structure, compatibility, filename representation, round trips and atomic persistence.
- `packages/core/test/infrastructure/node/hook-runner.spec.ts` — 14 declared tests; verbatim expansion and host quote normalization.
- `packages/core/test/infrastructure/node/hook-runner-spawn.spec.ts` — 4 declared tests; process execution behavior.
- `packages/core/test/composition/use-cases/transition-change.spec.ts` — 4 declared tests; config/resolver wiring.

Representative direct evidence includes transition source-post ordering/failure tests around `transition-change.spec.ts:1447-1610`, skip selector and recovery tests around `:1783-1835` and `:2555+`, verification non-manufacture/preservation tests around `:2901-2985`, external dispatch tests at `run-step-hooks.spec.ts:196-248`, workspace exclusion at `:685-712`, verification attempt history at `change.spec.ts:1658-1729`, and manifest v2/legacy/future-version coverage at `change-repository.spec.ts:2848-2965`.

## Missing Tests

No required scenario was found without an implementation-level test surface. Several merged scenarios intentionally map to the same parameterized or cross-spec test (for example hook timing is asserted by both the hook model and transition specs); this is reuse, not a coverage gap.

No additional test is required before completing the delegated compliance audit for this batch.

## Spec Dependency Chain

Direct dependencies were loaded to depth 1 and reviewed for contradiction:

- Hook model: `core:workflow-model`, `core:schema-format`, `core:hook-runner-port`, `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, `core:get-hook-instructions`, `core:config`, `cli:change-transition`, `cli:change-archive`, `core:transition-checks`.
- Change entity: `core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, `core:implementation-detector-port`, `core:transition-checks`.
- Transition: `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.
- Run-step hooks: `core:hook-execution-model`, `core:hook-runner-port`, `core:external-hook-runner-port`, `core:schema-format`, `core:config`, `core:change`, `core:template-variables`, `core:archive-repository-port`, `core:composition-resolver`.
- Manifest: `core:change`, `core:change-layout`, `core:storage`, `core:spec-metadata`, `core:spec-id-format`, `core:workspace`.

Dependency result: **0 contradictions**. The graph was current at commit `a5ecfed1` (`stale: false`, `fingerprintMismatch: false`, 1,288 indexed files, 49,990 symbols, 293 specs, zero parse failures).

## Numeric Summary

- Specs audited: **5**
- Requirements reviewed: **96**
- Verification scenarios reviewed: **266**
- Direct dependency specs reviewed (unique): **24**
- Focused test files passed: **7/7**
- Focused tests passed: **385/385**
- Critical findings: **0**
- High findings: **0**
- Medium findings: **0**
- Low findings: **0**
- Missing-test findings: **0**
- Compliance verdict: **PASS**

---

# Compliance audit — storage and graph batch

Change: `reconcile-lifecycle-transitions-with-main`  
Outer verification attempt: `verification-attempt-1` (delegated; this audit did not start or complete it)  
Specs: `core:fs-change-repository`, `core:change-repository-port`, `code-graph:indexer`, `code-graph:index-project-graph`

## Requirements Summary

### `core:fs-change-repository`

The merged spec contains 11 distinct requirements and 29 verification scenarios. It requires strict constructor configuration, factory registration, three bucket-specific `FsChangeIndexCache` instances, `updatedAt` compatibility, serialized and atomic cache mutation, mtime/invalidation freshness, write-path index maintenance, first persistence through `create`, post-mutation reconciliation, mutate-window-only byte writes, and Windows-safe path/move behavior.

### `core:change-repository-port`

The merged spec contains 29 distinct requirements and 78 verification scenarios. It defines the abstract repository surface: active/draft/discarded reads, serialized mutation returning `{ result, change }`, atomic reconciliation, hydration facts, list/count/reindex projections, first persistence, artifact concurrency and confinement, scaffolding, implementation-file access, and internal storage paths.

### `code-graph:indexer`

The merged spec contains 24 distinct requirements and 97 verification scenarios. It covers the complete atomic indexing pipeline: incremental/fingerprint behavior, deterministic spec coverage, discovery and portable identities, adapter-owned semantic extraction, bounded two-pass relation construction, progress/timing, error isolation, result diagnostics, reference facts, full-rebuild compatibility, indexed-input observations, and affected-closure incremental work.

### `code-graph:index-project-graph`

The merged spec contains 4 distinct requirements and 7 verification scenarios. It requires a thin use case that forwards prepared inputs to an already-open provider, forwards logical `force`, returns the provider result unchanged, owns no provider/storage/process lifecycle, and is constructed by a stateless factory.

## Implementation Status

### `core:fs-change-repository` — implemented

- `packages/core/src/infrastructure/fs/change-repository.ts` implements `ChangeRepository`, validates split runtime/config inputs, owns active/draft/discarded helpers, persists manifests atomically, serializes same-name mutations, reconciles after persist, confines artifact paths, and enforces the mutation window for `saveArtifact`.
- `packages/core/src/infrastructure/fs/fs-change-index-cache.ts` delegates list/count/reindex/invalidate/upsert/remove to the generic cache and supplies manifest projection, canonical bucket sorting, and mtime stamps.
- `packages/core/src/infrastructure/fs/fs-index-cache-base.ts` supplies the shared per-bucket lock, serialized mutation, atomic index/meta publication, invalidation, source-stamp freshness, and unchanged-row avoidance required by the specialized cache.
- `packages/core/src/composition/change-repository.ts` exposes the storage factory and forwards context/config separately.

No implementation mismatch was found in the inspected paths.

### `core:change-repository-port` — implemented

- `packages/core/src/application/ports/change-repository.ts:72` is the abstract port over `Repository`; its signatures and documentation cover the merged contract, including `MutateResult<T>`, read-only draft/discard views, list/count/reindex methods, first-time `create`, optimistic artifact writes, confinement-related operations, `implementationFile`, and `internalPaths`.
- `FsChangeRepository` provides the concrete implementation and its integration suite exercises the port semantics across persisted filesystem state.

No implementation mismatch was found.

### `code-graph:indexer` — implemented

- `packages/code-graph/src/application/use-cases/index-code-graph.ts:433` implements the multi-workspace indexing pipeline, including discovery, fingerprint comparison, atomic bulk sessions, semantic Pass 1/Pass 2, adapter-derived facts, spec/coverage projection, bounded affected-closure work, progress, phase metrics, and result diagnostics.
- Graph/store and adapter boundaries remain consistent with the direct dependency specs: the indexer consumes adapter payloads and the `GraphStore` atomic session rather than introducing language- or backend-specific ownership into the application use case.
- The current graph was verified fresh at commit `a5ecfed1`: 1,288 indexed files, 293 specs, `stale: false`, `fingerprintMismatch: false`, `contentFresh: true`, and `coverageComplete: true`.

No implementation mismatch was found.

### `code-graph:index-project-graph` — implemented

- `packages/code-graph/src/application/use-cases/index-project-graph.ts:11` accepts an open host port and prepared inputs.
- `IndexProjectGraph.execute()` at line 35 performs one `provider.index()` call, copies the workspace array, conditionally forwards `force`, `vcsRef`, `onProgress`, and `getSpecMetadata`, and returns the promise/result unchanged.
- It contains no open, close, clear, recreate, lock, subprocess, or recovery logic.
- `packages/code-graph/src/composition/use-cases/index-project-graph.ts:8` returns a new stateless instance.

The extra optional `getSpecMetadata` forwarding is compatible with, and required by, the merged indexer behavior; it does not contradict the prepared-input or lifecycle constraints.

## Discrepancies

No product-code/spec contradiction was identified. The discrepancies below are test-evidence gaps rather than observed implementation failures.

1. **MEDIUM — Windows move retry and drive-letter containment scenarios lack direct fault-injection coverage.**
   - Spec evidence: `core:fs-change-repository` requires case-insensitive drive containment, copy fallback for `EPERM`/`EXDEV`, bounded retry for `EPERM`/`EBUSY`/`EACCES`, and preservation of the original error.
   - Code evidence: the repository contains the cross-platform path and rename/copy paths, but searches of `change-repository.spec.ts` found no explicit `EPERM`, `EXDEV`, `EBUSY`, `EACCES`, or drive-letter assertions.
   - Interpretation: the implementation may be correct, but the spec's platform-specific behavior can regress without a mocked filesystem test or Windows CI assertion targeted at these branches.

2. **MEDIUM — index-pair failure atomicity is not explicitly fault-injected.**
   - Spec evidence: `core:fs-change-repository` requires temp cleanup, JSONL-before-meta publication, lock release on failure, and no half-published pair.
   - Test evidence: `fs-index-cache-base.spec.ts` covers upsert, remove, invalidation, mtime rebuild, fresh-cache reuse, concurrent mutation serialization, and identical-row avoidance; `fs-change-index-cache.spec.ts` covers rebuild/upsert/invalidate/remove. Neither suite injects a failure between JSONL and meta publication.
   - Interpretation: the shared implementation follows the required structure, but a fault-injection regression would not be caught directly.

3. **MEDIUM — the two explicit indexer error-isolation scenarios lack focused tests.**
   - Spec evidence: `code-graph:indexer` distinguishes a per-file parse failure (collect and continue) from a `GraphStore.upsertFile()`/infrastructure failure (abort the run).
   - Test evidence: the code-graph suites contain broad integration, adapter, store-contract, incremental, and recovery tests, but no test title or fixture directly exercises “one malformed source beside one valid source” and no focused injected store-connection failure during index persistence.
   - Interpretation: code inspection shows per-file collection and infrastructure propagation, but explicit scenario-level regression evidence is missing.

4. **LOW — prepared-input forwarding is asserted field-by-field only partially.**
   - Spec evidence: `code-graph:index-project-graph` says prepared project inputs are forwarded unchanged.
   - Test evidence: unit tests explicitly assert `force`, `onProgress`, `getSpecMetadata`, and both nullable/non-null `vcsRoot`; the base invocation exercises other fields but does not assert the complete object in one expectation.
   - Interpretation: the implementation is a direct object construction and is clear, so this is a test-strength issue rather than a likely defect.

## Test Coverage

Executed for this audit:

- `@specd/core` — `test/infrastructure/fs/change-repository.spec.ts`: **110/110 passed**.
- `@specd/code-graph` — `index-project-graph.spec.ts`, `index-project-graph-integration.spec.ts`, and `workspace-indexing.spec.ts`: **34/34 passed**.

Additional inspected coverage:

- `fs-index-cache-base.spec.ts`: cache mutation serialization, mtime freshness, invalidation, count maintenance, and no-op upsert.
- `fs-change-index-cache.spec.ts`: specialized manifest rebuild/upsert/invalidate/remove behavior.
- `repository-factories.spec.ts`: filesystem change-repository composition.
- `host-use-case-factories.spec.ts`: stateless `IndexProjectGraph` factory.
- `index-project-graph-integration.spec.ts`: forced logical rebuild without storage recreation, spec-lock-only coverage reprojection, multi-language reference facts, missing-target importer repair, bounded high-cardinality construction, one native bulk session, dirty-index resolution behavior, incompatible-store recovery boundary, and anchored coverage.
- `workspace-indexing.spec.ts`: resolution fingerprint stability, durable coverage outcomes, affected-closure incremental work, multi-workspace identities, document encodings, root-identity deduplication, spec-root exclusion, optimized descriptions, materialized metadata fingerprints, and unchanged-run zero-work metrics.
- Graph-store contract, SQLite, language-adapter, discovery, staleness, traversal, and symbol-resolution suites cover the indexer's direct dependency contracts.

## Missing Tests

Recommended additions, without implying a current implementation failure:

1. Mock rename/copy failures for every required Windows error code and assert retry count, fallback behavior, destination-byte handling, and original-error propagation.
2. Add a drive-letter case containment test independent of the host operating system.
3. Fault-inject failure after JSONL temp publication but before meta publication; assert live-pair consistency, temp cleanup, and subsequent lock acquisition.
4. Index one valid and one syntactically invalid source in the same run; assert the valid node persists and the invalid file is reported/counts correctly.
5. Inject a `GraphStore` infrastructure failure during the atomic session and assert the whole indexing run rejects and no generation becomes readable.
6. Strengthen `IndexProjectGraph`'s unit assertion to compare the full forwarded options object, including `projectRoot`, copied workspaces, `graphConfig`, `codeGraphVersion`, and optional omission semantics.

## Spec Dependency Chain

The merged change context was loaded with direct dependencies at depth 1 plus rules and constraints. No contradiction was found.

- `core:fs-change-repository` → `default:_global/architecture`, `core:composition`, `core:storage`, `core:change-list-entry`, `core:change-repository-port`.
- `core:change-repository-port` → `default:_global/architecture`, `core:repository-port`, `core:change`, `core:read-only-change-view`, `core:drafted-change-view`, `core:discarded-change-view`, `core:storage`, and related error/layout contracts surfaced by the compiled context.
- `code-graph:indexer` → `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`, `code-graph:document-model`, `code-graph:sqlite-graph-store`, `core:spec-repository-port`, `core:get-spec-metadata`, and global architecture/conventions.
- `code-graph:index-project-graph` → `code-graph:composition`, `code-graph:indexer`, `code-graph:graph-store`, `core:config`.

Consistency conclusions:

- The core port remains application-layer and backend-neutral; filesystem concerns stay in infrastructure and construction stays in composition.
- Change list rows and bucket ordering agree with `core:change-list-entry` and `core:storage`.
- Index execution remains adapter/store neutral, uses atomic store sessions, and does not duplicate provider lifecycle ownership.
- Forced logical reindex is distinct from physical storage recreation, matching both `code-graph:graph-store` and `code-graph:composition`.

## Numeric Summary

| Metric                          | Count |
| ------------------------------- | ----: |
| Specs audited                   |     4 |
| Distinct requirements reviewed  |    68 |
| Verification scenarios reviewed |   211 |
| Focused tests executed          |   144 |
| Focused tests passed            |   144 |
| Product-code discrepancies      |     0 |
| Critical findings               |     0 |
| High findings                   |     0 |
| Medium test-evidence gaps       |     3 |
| Low test-evidence gaps          |     1 |
| Recommended missing tests       |     6 |

**Batch verdict:** PASS WITH TEST-GAP ADVISORIES. The four implementations conform to the merged specs and direct dependency contracts on inspected evidence; no lifecycle-blocking implementation or semantic-spec issue was found.

---

# Compliance audit — CLI, testing, documentation, guide, and workflow automation

Delegated verification attempt: `verification-attempt-1`  
Change: `reconcile-lifecycle-transitions-with-main`  
Scope: `cli:entrypoint`, `cli:change-transition`, `default:_global/testing`, `default:_global/docs`, `guide:conventions`, `skills:workflow-automation`

## Requirements Summary

The six merged specs contain 68 requirements and 181 verification scenarios. All change deltas except `cli:entrypoint` are intentional no-ops: they retain the existing normative contract while reconciling implementation, generated metadata, package layout, documentation topology, and workflow templates after the merge. `cli:entrypoint` adds the explicit reusable `createProgram(): Command` contract.

| Spec                         | Requirements | Scenarios | Compliance result |
| ---------------------------- | -----------: | --------: | ----------------- |
| `cli:entrypoint`             |           16 |        40 | Compliant         |
| `cli:change-transition`      |           15 |        48 | Compliant         |
| `default:_global/testing`    |            8 |        15 | Compliant         |
| `default:_global/docs`       |           13 |        36 | Compliant         |
| `guide:conventions`          |            5 |        13 | Compliant         |
| `skills:workflow-automation` |           11 |        29 | Compliant         |

## Implementation Status

### `cli:entrypoint`

Implemented. `packages/cli/src/program.ts` owns the reusable `createProgram()` factory, assembles the complete Commander tree, installs root banner/config propagation/default dashboard behavior, and returns without parsing arguments. `packages/cli/src/index.ts` is now a thin process adapter: it exports the factory, creates the program, parses `process.argv`, and delegates errors to `handleError`. The factory registers `changes transition`, verification, implementation tracking, and `guide` exactly once. `packages/cli/test/documentation-coverage.spec.ts` proves that the returned tree is introspectable without process execution and dynamically checks the command/documentation topology. Existing entrypoint, error, and table tests cover the rest of the merged contract.

### `cli:change-transition`

Implemented and unchanged semantically. Registration moved intact from the former monolithic entrypoint into `createProgram()`. The transition handler remains delegated to the core transition/status/hook contracts, including `--next`, explicit target selection, hook selectors, progress presentation, repair guidance, incomplete-task checks, and structured output behavior. The no-op delta accurately describes a registration/metadata reconciliation rather than a behavioral change.

### `default:_global/testing`

Implemented. The root test matrix includes all workspace packages and CI runs on macOS, Ubuntu, and Windows. Tests remain under package `test/` trees and use Vitest. The merged Windows compatibility work uses OS-derived paths, normalized path assertions, cross-platform spawning/hook translation, and newline normalization. The focused suites exercised CLI, guide, and skills behavior without snapshots; the previously completed full repository gate additionally exercised the cross-platform core/code-graph suites.

### `default:_global/docs`

Implemented. User-facing material is under `docs/guide`, command reference material is under `docs/cli`, and developer/API material remains in the designated package/core/SDK locations. New CLI families have dedicated pages (`config`, `discarded`, `drafts`, `graph`, `guide`, `plugins`, `schema`, `specs`, `storage`, etc.). `documentation-coverage.spec.ts` introspects `createProgram()` and enforces a dedicated command-family page, subcommand mentions, guide coverage, and CLI index coverage. `configuration-coverage.spec.ts` dynamically checks the guide against the exported configuration schemas and cascade operations. The reconciled links point to the canonical configuration guide rather than obsolete locations.

### `guide:conventions`

Implemented. `@specd/guide` is a standalone publishable package with only `minisearch` as a runtime dependency and no dependency on `@specd/core` or any other SpecD package. Its public surface exports domain models/errors, application ports/utilities, and the composition facade. Domain, application, infrastructure, and composition directories preserve the hexagonal boundary. Build-time guide bundling is explicit; package scripts cover build, development, typecheck, test, and lint; the package README documents architecture and usage.

### `skills:workflow-automation`

Implemented. The shared and agent-instruction templates encode graph-first research, guide-first documentation lookup, canonical plural resource groups, text-first lifecycle diagnostics, TOON-first structured extraction, exact `specs show` versus semantic `specs context` versus diagnostic `specs metadata`, on-demand outlines, merged `spec-preview` review, canonical status recovery, verification-attempt ownership/delegation, explicit implementation tracking resolution, and optimizer-agent policy. The generated `.agents`/`.codex` skills reflect those templates, including delegated compliance using the outer attempt without starting or completing it.

## Discrepancies

No compliance discrepancies were found.

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

The only tooling anomaly was an `rtk` wrapper exit status of 1 for `pnpm --filter @specd/guide typecheck`, while the wrapper simultaneously reported “TypeScript: No errors found” and warned that this filter form was unsupported. Re-running the package-local command as `pnpm --dir packages/guide typecheck` exited 0. This is command-wrapper behavior, not a product or spec discrepancy.

## Test Coverage

Focused verification executed during this audit:

| Evidence                                                                                 | Result                    |
| ---------------------------------------------------------------------------------------- | ------------------------- |
| CLI transition, documentation coverage, configuration coverage, and guide-command suites | 4 files, 142 tests passed |
| CLI entrypoint, error handling, and terminal-table suites                                | 3 files, 58 tests passed  |
| Complete `@specd/guide` suite                                                            | 7 files, 58 tests passed  |
| Skills workflow/template rendering suites                                                | 2 files, 20 tests passed  |
| `@specd/guide` lint                                                                      | Passed                    |
| `@specd/guide` package-local typecheck                                                   | Passed                    |

Total focused evidence: 16 test files and 278 passing tests, plus lint and typecheck. The outer implementation run also recorded successful repository-wide test, lint, typecheck, and build gates; this audit did not substitute that declaration for its own focused execution.

Coverage is requirement-aligned:

- Entrypoint process behavior, error streams/codes, formatting, banner, terminal sizing, and factory introspection are exercised by the CLI entrypoint/error/table and documentation-coverage suites.
- Transition command signature, resolution, status delegation, hook behavior, progress, structured output, and repair paths are exercised by the 94-test transition suite contained in the 142-test CLI batch.
- Documentation topology and configuration accuracy are enforced dynamically against the live command tree and Zod schemas.
- Guide architecture, errors, models, queries, slicing, search, bundle generation, and integration are covered by all seven guide suites.
- Workflow template propagation and canonical instruction content are covered by skills template tests.
- Cross-platform policies are backed by the full repository run and the imported Windows compatibility tests across core, CLI, and code graph.

## Missing Tests

No blocking missing tests were identified for this change scope. The `createProgram()` scenario is directly exercised through construction and traversal by `documentation-coverage.spec.ts`; importing and invoking it without argument parsing provides the required non-exiting introspection surface. The no-op specs preserve already-covered contracts, and their relevant existing suites passed.

Optional hardening, not a compliance gap: add a narrowly named unit test whose title exactly mirrors “Factory returns executable Commander instance without argument parsing.” Current behavioral coverage is equivalent but distributed between `documentation-coverage.spec.ts` and the thin `index.ts` adapter.

## Spec Dependency Chain

- `cli:entrypoint` → `core:config`; `default:_global/error-handling-conventions`.
- `cli:change-transition` → `cli:entrypoint`; `core:change`; `core:transition-change`; `core:hook-execution-model`; `core:get-status`; `core:transition-checks`.
- `default:_global/testing` → `default:_global/architecture`; `default:_global/conventions`.
- `default:_global/docs` → `default:_global/conventions`.
- `guide:conventions` → no declared dependencies; it is the package-wide constraint root.
- `skills:workflow-automation` → `cli:command-resource-naming`; `skills:agents`; `cli:spec-context`; `cli:spec-metadata`; `core:get-status`; `core:validate-artifacts`; `core:transition-checks`.

The merged requirements are mutually consistent. In particular, the plural command registration in `createProgram()` matches workflow automation; the guide package has the zero-Core boundary required by its conventions; documentation introspection uses the decoupled CLI factory; and transition behavior continues to delegate canonical lifecycle validity and recovery decisions to Core rather than duplicating them in CLI code or skill prose.

## Numeric Summary

- Specs audited: 6
- Direct dependency specs reviewed for consistency: 17 references, 15 unique dependency specs
- Requirements audited: 68
- Verification scenarios reviewed: 181
- Requirements compliant: 68
- Requirements partially compliant: 0
- Requirements non-compliant: 0
- Discrepancies: 0
- Blocking missing tests: 0
- Focused tests passed: 278
- Focused test failures: 0
- Lint/typecheck failures attributable to product code: 0
- Overall result: **PASS**

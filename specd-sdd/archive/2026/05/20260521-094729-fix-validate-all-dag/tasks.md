# Tasks: fix-validate-all-dag

## 1. Canonical ArtifactDag (core domain)

- [x] 1.1 Add `ArtifactDag` value object
      `packages/core/src/domain/value-objects/artifact-dag.ts`: `ArtifactDag`
      Approach: implement `static from(artifacts: readonly ArtifactType[])` building inverse `requires` adjacency; expose `roots()`, `childrenOf(id)`, `topologicalOrder()`, `descendantsOf(ids)` with stable tie-break using schema declaration order among siblings
      (Req: Schema artifact DAG API, Canonical artifact DAG derivation)

- [x] 1.2 Export `ArtifactDag` from core public surface
      `packages/core/src/domain/value-objects/index.ts`, `packages/core/src/domain/index.ts`
      Approach: re-export `ArtifactDag` for tests; keep CLI depending on `Schema` only
      (Req: Schema artifact DAG API)

- [x] 1.3 Wire lazy `Schema.artifactDag()`
      `packages/core/src/domain/value-objects/schema.ts`: `Schema`
      Approach: add private `_artifactDag?: ArtifactDag`; `artifactDag()` memoizes `ArtifactDag.from(this._artifacts)` for object lifetime
      (Req: Schema artifact DAG API)

- [x] 1.4 Add `ArtifactDag` unit tests
      `packages/core/test/domain/value-objects/artifact-dag.spec.ts`
      Approach: cover schema-std topo order (proposal before specs before verify), `childrenOf('proposal')` direct dependents only, `descendantsOf(['specs'])` includes verify/tasks, cache identity via repeated `schema.artifactDag()` on same `Schema`
      (Req: Schema artifact DAG API, Canonical artifact DAG derivation — verify scenarios)

## 2. Change.invalidate and callers

- [x] 2.1 Extend `Change.invalidate` with required `artifactDag`
      `packages/core/src/domain/entities/change.ts`: `invalidate`, `_expandAffectedArtifacts`
      Approach: add `artifactDag: ArtifactDag` parameter; replace `_findDagDescendants` with `artifactDag.descendantsOf(normalizedRootTypes)` for `downstream` policy; delete private BFS helper
      (Req: Policy-aware invalidation)

- [x] 2.2 Pass `artifactDag` from `ValidateArtifacts` drift invalidation
      `packages/core/src/application/use-cases/validate-artifacts.ts`: drift invalidation block
      Approach: after resolving schema, call `freshChange.invalidate(..., schema.artifactDag())` on drift path
      (Req: Policy-aware invalidation, Approval invalidation on content change)

- [x] 2.3 Pass `artifactDag` from `TransitionChange` invalidation
      `packages/core/src/application/use-cases/transition-change.ts`
      Approach: supply `schema.artifactDag()` on every `invalidate` call when returning to `designing`
      (Req: Policy-aware invalidation)

- [x] 2.4 Pass `artifactDag` from `InvalidateChange`
      `packages/core/src/application/use-cases/invalidate-change.ts`
      Approach: remove `orderArtifactsByTraversal`; pass `schema.artifactDag()` into `invalidate`; order reported affected artifact types via `topologicalOrder()` filtered to expanded set
      (Req: Affected-set traversal order, Policy-aware artifact effects)

- [x] 2.5 Pass `artifactDag` from `archive-change` overlap invalidation
      `packages/core/src/application/use-cases/archive-change.ts`
      Approach: pass active schema `artifactDag()` when invalidating overlapping changes
      (Req: Policy-aware invalidation)

- [x] 2.6 Pass `artifactDag` from `change-repository` load drift path
      `packages/core/src/infrastructure/fs/change-repository.ts`
      Approach: resolve schema (or dag) at invalidation site; pass `artifactDag` into `change.invalidate`
      (Req: Policy-aware invalidation)

- [x] 2.7 Update entity and repository tests for new `invalidate` signature
      `packages/core/test/domain/entities/change.spec.ts`, `packages/core/test/infrastructure/fs/change-repository.spec.ts`, `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: construct minimal `ArtifactDag.from(schemaStdArtifacts)` in fixtures; assert downstream expansion uses schema descendants not manifest `requires`
      (Req: Downstream invalidation reopens target set and descendants)

## 3. LifecycleEngine next artifact

- [x] 3.1 Scan topological order in `_nextArtifact`
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_nextArtifact`
      Approach: iterate `schema.artifactDag().topologicalOrder()` instead of `schema.artifacts()`; return first artifact not effectively `complete`/`skipped` with satisfied `requires`
      (Req: Next artifact topological order)

- [x] 3.2 Add lifecycle-engine tests for topo next artifact
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`
      Approach: fixture where declaration order would pick `design` but DAG order must pick `specs` first
      (Req: Next artifact topological order — verify scenarios)

## 4. ValidateArtifacts batch semantics

- [x] 4.1 Iterate artifacts in topological order
      `packages/core/src/application/use-cases/validate-artifacts.ts`: main validation loop
      Approach: when validating multiple artifact types in one `execute`, use `schema.artifactDag().topologicalOrder()` instead of `schema.artifacts()` declaration order
      (Req: Artifact traversal order)

- [x] 4.2 Refresh lifecycle between validation steps
      `packages/core/src/application/use-cases/validate-artifacts.ts`: dependency checks / `markComplete`
      Approach: recompute `LifecycleEngine.evaluate` (or dependency verdict helper) after each successful file/artifact completion within the same `execute`; do not freeze `artifactVerdicts` only at start
      (Req: Dependency order check, Artifact traversal order)

- [x] 4.3 Skip `complete` and `skipped` tracked files
      `packages/core/src/application/use-cases/validate-artifacts.ts`: per-file loop
      Approach: before read/validate, if file canonical status is `complete` or `skipped`, omit from validation and `markComplete`; still validate drift/review states
      (Req: Complete and skipped file bypass)

- [x] 4.4 Extend validate-artifacts tests
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`
      Approach: add cases for topo ordering within one execute, parent visible as complete to child in same pass, complete file skip, drift-pending still validated
      (Req: Artifact traversal order, Complete and skipped file bypass — verify scenarios)

## 5. CLI `changes validate --all`

- [x] 5.1 Rewrite `executeBatch` DAG driver
      `packages/cli/src/commands/change/validate.ts`: `executeBatch`
      Approach: load schema; walk `artifactDag().topologicalOrder()`; for `scope: change` call `validate.execute({ name, artifactId })` once; for `scope: spec` call per `specId`; honor `--artifact` filter without changing walk order
      (Req: Batch mode \(--all\))

- [x] 5.2 Update batch text and JSON output
      `packages/cli/src/commands/change/validate.ts`: formatters
      Approach: JSON `results[]` entries include `artifact` and `spec` (null for change-scoped); text summary reports passed/scheduled steps not legacy `validated N/M specs` only
      (Req: Batch mode \(--all\))

- [x] 5.3 Update change-validate CLI tests
      `packages/cli/test/commands/change-validate.spec.ts`
      Approach: assert change-scoped artifact validated once, spec-scoped per specId, `--all --artifact specs` filters steps, partial failure still runs all steps, JSON shape includes `artifact`
      (Req: Batch mode \(--all\) — verify scenarios)

## 6. CLI `changes status` DAG display

- [x] 6.1 Derive JSON `schema.artifactDag` from `ArtifactDag`
      `packages/cli/src/commands/change/status.ts`: structured schema payload
      Approach: emit entries in `topologicalOrder()`; set `children` from `childrenOf(id)`; stop using `requires.includes(id)` filters
      (Req: Schema-derived fields)

- [x] 6.2 Fix text `renderDag` tree
      `packages/cli/src/commands/change/status.ts`: `renderDag`
      Approach: build forest from `dag.roots()` and recursive `childrenOf`; preserve existing status/drift/task-completion adornments
      (Req: Schema-derived fields, Task completion display in DAG)

- [x] 6.3 Update change-status CLI tests
      `packages/cli/test/commands/change-status.spec.ts`
      Approach: JSON `children` matches `childrenOf`; text DAG root/child order matches dag not declaration order
      (Req: Schema-derived fields — verify scenarios)

## 7. InvalidateChange and integration tests

- [x] 7.1 Add invalidate-change reporting-order tests
      `packages/core/test/application/use-cases/invalidate-change.spec.ts`
      Approach: downstream invalidation spanning multiple artifact types reports types in topological order
      (Req: Affected-set traversal order)

## 8. GetArtifactInstruction (tests only)

- [x] 8.1 Assert auto-selection uses topological next artifact
      `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts` (create if missing)
      Approach: stub `LifecycleEngine` / engine path so first incomplete topo artifact is returned when `artifactId` omitted; all-complete throws `ArtifactNotFoundError`
      (Req: Input — get-artifact-instruction verify scenarios)

## 9. Documentation

- [x] 9.1 Update CLI reference for `--all`
      `docs/cli/cli-reference.md`: `changes validate`
      Approach: document DAG-ordered batch, change-scoped once vs spec-scoped per specId, `--all --artifact`, JSON `results[]` fields, complete-file skip behaviour at use-case layer
      (Req: Batch mode \(--all\), design Testing — Documentation)

## 10. Build, verify, and manual E2E

- [x] 10.1 Build affected packages
      `packages/core`, `packages/cli`
      Approach: `pnpm --filter @specd/core build && pnpm --filter @specd/cli build`
      (Req: global testing conventions)

- [x] 10.2 Run targeted test suites
      Root / package test commands for files listed in design Testing table
      Approach: run new/updated specs until green; fix regressions from `Change.invalidate` signature
      (Req: all verify scenarios)

- [x] 10.3 Manual E2E on `fix-validate-all-dag`
      CLI commands from design.md Testing — Manual / E2E
      Approach: (1) `changes validate fix-validate-all-dag --all` with partial completion — parents before children; (2) double `--all` with complete proposal + active approval — no drift invalidation; (3) `changes status fix-validate-all-dag --format json` — `children` matches schema DAG
      (Req: Batch mode, Complete and skipped file bypass, Schema-derived fields)

- [x] 10.4 Validate change artifacts after implementation
      `node packages/cli/dist/index.js changes validate fix-validate-all-dag --all`
      Approach: full change validation pass before archive/transition
      (Req: cli:change-validate)

## 11. Compliance remediation (post-audit)

- [x] 11.1 EditChange uses schema.artifactDag()
      `packages/core/src/application/use-cases/edit-change.ts`, `packages/core/src/composition/kernel.ts`, `packages/core/test/application/use-cases/edit-change.spec.ts` (create or extend)
      Approach: inject `SchemaProvider`; pass `schema.artifactDag()` into `updateSpecIds`; test downstream expansion order vs persisted requires mismatch
      (Req: Canonical artifact DAG derivation, verify EditChange scenario)

- [x] 11.2 Optional specPath for change-scoped ValidateArtifacts
      `packages/core/src/application/use-cases/validate-artifacts.ts`, tests
      Approach: `specPath?: string`; omit guard when undefined + change-scoped; add verify scenario test
      (Req: Input — validate-artifacts)

- [x] 11.3 Batch validate: no specPath placeholder + JSON warnings
      `packages/cli/src/commands/change/validate.ts`, `packages/cli/test/commands/change-validate.spec.ts`
      Approach: change-scoped execute without specPath; map `notes` → `warnings` in batch JSON; test multi-artifact DAG mock with proposal + specs
      (Req: Batch mode, verify change-scoped batch)

- [x] 11.4 Status DAG display fixes
      `packages/cli/src/commands/change/status.ts`, `packages/cli/test/commands/change-status.spec.ts`
      Approach: `displayStatus` in renderDag; visited set for convergent DAG; `hasTasks` from taskCompletionCheck; prefer `schema.artifactDag()` when schema resolved
      (Req: Display-state rendering, Schema-derived fields, verify text DAG scenarios)

- [x] 11.5 Validate multi-artifact topological order test
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`
      Approach: assert call/validation order matches `topologicalOrder()` when multiple artifacts validated in one execute
      (Req: Artifact traversal order)

- [x] 11.6 Re-run compliance spot-check
      Manual: `changes validate --all`, `changes status --format json`, targeted package tests
      Approach: confirm report IDs SF-1, VA-1, CLI-V1/V2, CLI-S1/S2, VA-2, SF-2 closed
      (Req: compliance report 20260522-193804)

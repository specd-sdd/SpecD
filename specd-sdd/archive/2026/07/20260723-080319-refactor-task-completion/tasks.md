# Tasks: refactor-task-completion

## 1. Shared task-counting query

- [x] 1.1 Define CountTasks contracts
      `packages/core/src/application/use-cases/count-tasks.ts`: `TaskCompletionStatus`, `CountTasksInput`, and `CountTasksResult` — define per-artifact `byArtifact` and change-wide `total` results.
      Approach: move the shared completion-count shape from `GetStatus`; use a readonly record keyed by artifact ID and a separate aggregate status.
      (Req: Returns per-artifact and aggregate completion status)
- [x] 1.2 Implement qualifying-artifact counting
      `packages/core/src/application/use-cases/count-tasks.ts`: `CountTasks.execute()` — resolve the schema, load only task-capable artifact files, and aggregate counts.
      Approach: require `hasTasks` plus `taskCompletionCheck`, skip missing or empty files, use existing checkbox defaults when patterns are absent, and compile with `safeRegex` and `gm`.
      (Req: Counts qualifying task artifacts)
- [x] 1.3 Preserve capability boundary and read-only behavior
      `packages/core/src/application/use-cases/count-tasks.ts`: `CountTasks.execute()` — omit missing or empty artifacts without treating them as invalid capability.
      Approach: return an empty `byArtifact` and zero aggregate when no qualifying content exists; never mutate the change or decide transition permission.
      (Req: Does not infer task capability from counts)

## 2. Composition and public kernel surface

- [x] 2.1 Add the CountTasks composition factory
      `packages/core/src/composition/use-cases/count-tasks.ts`: `CountTasksDeps`, `resolveCountTasksDeps`, and `createCountTasks` overloads — construct the query from explicit dependencies or config.
      Approach: derive only `getChangeRepository()` and `getSchemaProvider()` through the existing resolver, then delegate config construction to the canonical deps form.
      (Req: Supports composition and kernel wiring)
- [x] 2.2 Inject CountTasks into status composition
      `packages/core/src/composition/use-cases/get-status.ts`: `GetStatusDeps`, `resolveGetStatusDeps`, and normalized construction — pass the shared query to `GetStatus`.
      Approach: extend existing dependency interfaces and resolver-backed construction without changing repository bootstrap.
      (Req: Constructor dependencies; Config-based factory delegates through resolveGetStatusDeps)
- [x] 2.3 Inject CountTasks into transition composition
      `packages/core/src/composition/use-cases/transition-change.ts`: `TransitionChangeDeps`, `resolveTransitionChangeDeps`, and normalized construction — pass the shared query to `TransitionChange`.
      Approach: extend existing dependency interfaces and retain the current factory argument-validation path.
      (Req: Dependencies; Config-based factory delegates through resolveTransitionChangeDeps)
- [x] 2.4 Expose CountTasks from the kernel
      `packages/core/src/composition/kernel.ts`: `Kernel` and `createKernel` — add `changes.countTasks` and wire it from the resolver-backed factory.
      Approach: mount the concrete use case in the changes domain group alongside `status` and `transition`; do not change `CompositionResolver`.
      (Req: Kernel interface groups use cases by domain area; Every exported use case must have a kernel entry)
- [x] 2.5 Export the new use case surface
      `packages/core/src/public.ts` and `packages/core/src/index.ts`: CountTasks exports — expose the use case, public I/O types, and `createCountTasks` consistently with kernel-mounted use cases.
      Approach: preserve any internal compatibility re-export needed for the former `GetStatus` type location and avoid duplicate type definitions.
      (Req: Kernel entries must match use case types)

## 3. Delegate existing callers

- [x] 3.1 Replace GetStatus local counting
      `packages/core/src/application/use-cases/get-status.ts`: status projection and constructor — call `CountTasks.execute({ change })` once and map `byArtifact` to `ArtifactStatusEntry.taskCompletion`.
      Approach: preserve omission of `taskCompletion` for missing or empty content; do not add the aggregate total to `GetStatusResult`.
      (Req: Reports task completion counts for task-capable artifacts)
- [x] 3.2 Replace TransitionChange local counting
      `packages/core/src/application/use-cases/transition-change.ts`: task-completion enforcement and constructor — remove the duplicated private content-count helper and consume the shared query once per transition.
      Approach: validate `hasTasks` and `taskCompletionCheck` before lookup, preserve `missing-task-capability`, skip absent result entries after capability validation, and preserve incomplete-task events and errors.
      (Req: Task completion check during requires enforcement)

## 4. Automated coverage

- [x] 4.1 Test CountTasks behavior
      `packages/core/test/application/use-cases/count-tasks.spec.ts`: new test suite — cover multi-file counts, aggregate totals, default patterns, unsafe regexes, non-task artifacts, and missing or empty files.
      Approach: mock `ChangeRepository` and `SchemaProvider`; assert zero aggregate and empty `byArtifact` for no qualifying content.
      (Req: Counts qualifying task artifacts; Returns per-artifact and aggregate completion status; Does not infer task capability from counts)
- [x] 4.2 Update GetStatus tests
      `packages/core/test/application/use-cases/get-status.spec.ts`: task-completion cases and constructor helpers — inject CountTasks and retain per-artifact output assertions.
      Approach: assert `byArtifact` drives task fields and missing or empty artifacts remain omitted.
      (Req: Reports task completion counts for task-capable artifacts)
- [x] 4.3 Update TransitionChange tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`: task-gate cases and constructor helpers — inject CountTasks and retain existing outcome assertions.
      Approach: assert missing capability, incomplete-task payload counts, missing-file skip, and progress-event-before-error behavior.
      (Req: Task completion check during requires enforcement)
- [x] 4.4 Test factory and kernel wiring
      `packages/core/test/composition/` factory tests and `packages/core/test/composition/kernel.spec.ts`: CountTasks factory and `kernel.changes.countTasks` coverage.
      Approach: exercise explicit-deps and config forms, then assert the kernel exposes a ready query using resolver-backed dependencies.
      (Req: Supports composition and kernel wiring; Kernel entry mapping)

## 5. Validation

- [x] 5.1 Run core automated checks
      `packages/core`: core test, lint, and build commands — verify the new use case, changed callers, exports, and composition surface compile and pass.
      Approach: run `pnpm --filter @specd/core test`, `pnpm lint --filter @specd/core`, and `pnpm build --filter @specd/core`; fix only regressions introduced by this change.
      (Req: all CountTasks, GetStatus, TransitionChange, and Kernel requirements)
- [x] 5.2 Perform fixture-level integration verification
      `packages/core` test fixture or local harness: `createKernel(config)` and `kernel.changes.countTasks.execute({ change })` — confirm per-artifact and aggregate counts agree.
      Approach: use multiple task-capable artifacts, then confirm `GetStatus` continues exposing only per-artifact task counts and no global result field.
      (Req: Returns per-artifact and aggregate completion status; Reports task completion counts for task-capable artifacts)

## 6. Follow-up: materialized default and public documentation

- [x] 6.1 Materialize the uppercase-complete checkbox default
      `packages/core/src/domain/services/build-schema.ts`: `buildArtifactType()` — set the omitted `completePattern` default to `^\s*-\s+\[xX\]`.
      Approach: preserve supplied patterns and the incomplete default; change only the constructed default so every schema consumer receives the same case-inclusive regex.
      (Req: taskCompletionCheck)
- [x] 6.2 Cover schema default materialization
      `packages/core/test/domain/services/build-schema.spec.ts`: task-completion default test — assert the resolved pattern is `^\s*-\s+\[xX\]` and matches `[x]` and `[X]`.
      Approach: extend the existing build-schema fixture instead of testing a consumer fallback.
      (Req: taskCompletionCheck, scenario: Default complete pattern accepts uppercase markers)
- [x] 6.3 Complete focused uppercase and unsafe-pattern query coverage
      `packages/core/test/application/use-cases/count-tasks.spec.ts`: `CountTasks` scenarios — make the `[X]` aggregate fixture pass and add the unsafe-pattern zero-entry edge case.
      Approach: resolve the schema through `buildSchema` where default materialization matters; assert `byArtifact` and aggregate fields independently.
      (Req: Counts qualifying task artifacts; Returns per-artifact and aggregate completion status)
- [x] 6.4 Document the public task-counting query
      `docs/core/use-cases.md`: `CountTasks` section — describe its per-artifact and change-wide aggregate result and its read-only role.
      Approach: place it with public core use-case documentation; do not document internal implementation loops or duplicate lifecycle policy.
      (Req: Supports composition and kernel wiring)

## 7. Follow-up: schema-owned resolved patterns

- [x] 7.1 Correct and test the resolved complete-pattern default
      `packages/core/src/domain/services/build-schema.ts`: `buildArtifactType()` and `packages/core/test/domain/services/build-schema.spec.ts` — materialize the valid completed-checkbox default `^\s*-\s+\[[xX]\]` for every `hasTasks: true` artifact, including an omitted raw completion-check object.
      Approach: make `buildSchema` the only defaulting boundary; preserve supplied fields verbatim and assert the resolved expression matches both `[x]` and `[X]` rather than the literal string `[xX]`.
      (Req: taskCompletionCheck, scenario: Default complete pattern accepts uppercase markers)
- [x] 7.2 Remove use-case pattern fallback and repair default-bearing fixtures
      `packages/core/src/application/use-cases/count-tasks.ts` and `packages/core/test/application/use-cases/count-tasks.spec.ts`: consume only `taskCompletionCheck.incompletePattern` and `completePattern` from the resolved schema.
      Approach: remove nullish fallback regexes; construct the default-pattern fixture through `buildSchema`, while fixtures that bypass schema construction provide both resolved patterns explicitly.
      (Req: Counts qualifying task artifacts; Returns per-artifact and aggregate completion status; scenario: Resolved schema provides omitted patterns)

## 8. Follow-up: cross-artifact aggregate coverage

- [x] 8.1 Test aggregation across distinct task artifacts
      `packages/core/test/application/use-cases/count-tasks.spec.ts`: `CountTasks` aggregate scenario — add two qualifying artifact types with independent files and assert both `byArtifact` entries plus the combined `total`.
      Approach: construct resolved completion checks explicitly for each fixture artifact, execute one query for the change, and assert the aggregate sums complete, incomplete, and total across artifact IDs rather than only files of one artifact.
      (Req: Returns per-artifact and aggregate completion status, scenario: Aggregate combines qualifying artifacts)

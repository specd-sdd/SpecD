# Tasks: move-impl-tracking-to-cli

## 1. RefreshImplementationTracking use case

- [x] 1.1 Add `RefreshImplementationTracking` use case
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `RefreshImplementationTracking`
      Approach: Move the detection merge loop from `get-status.ts` into `execute()`: `mutate(name, async (change) => { if (change.getHistoricalImplementationAt() === null) return change; const files = await detector.detectModifiedFiles(change); for (const file of files) { if (!change.trackedImplementationFiles.some(e => e.file === file)) change.trackImplementationFile(file, 'open'); } return change; })`, then return `{ implementationTracking: projectImplementationTracking(change) }`. Throw `ChangeNotFoundError` when change missing.
      (Req: Input contract, Historical implementing guard, Detection merge semantics, Persistence, Result projection, Change must exist, Constructor dependencies, Delivery-agnostic boundary)

- [x] 1.2 Export public types from core package
      `packages/core/src/index.ts`
      Approach: Re-export `RefreshImplementationTracking`, `RefreshImplementationTrackingInput`, and `RefreshImplementationTrackingResult` alongside other use cases.
      (Req: Constructor dependencies)

## 2. Kernel composition

- [x] 2.1 Wire refresh use case and remove detector from read/transition/compile use cases
      `packages/core/src/composition/kernel.ts`: `createKernel`, `Kernel` interface
      Approach: Keep single `VcsImplementationDetector` instance; add `refreshImplementationTracking: new RefreshImplementationTracking(i.changes, implementationDetector)` under `changes`; remove `implementationDetector` argument from `GetStatus`, `TransitionChange`, and `CompileContext` constructors.
      (Req: Constructor dependencies — GetStatus, TransitionChange, CompileContext; RefreshImplementationTracking)

## 3. Strip autodetection from core use cases

- [x] 3.1 Make `GetStatus` read-only for implementation tracking
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus`
      Approach: Remove `_implementationDetector` field and constructor param; replace pre-status `mutate`+detect block with plain `get(name)` load; keep `projectImplementationTracking` in result. Preserve all lifecycle/review logic unchanged.
      (Req: Read-only implementation tracking, Implementation status projection, Constructor dependencies)

- [x] 3.2 Remove autodetection from `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange`
      Approach: Delete detector field/constructor param and the `detectModifiedFiles` loop inside pre-transition `mutate`; leave invalidation, `transition()`, and hooks untouched.
      (Req: Caller-owned implementation tracking refresh, Dependencies)

- [x] 3.3 Remove autodetection from `CompileContext`
      `packages/core/src/application/use-cases/compile-context.ts`: `CompileContext`
      Approach: Remove `implementationDetector` from constructor signature and class fields; delete pre-compile `mutate` detection block; update constructor JSDoc and TypeScript example in spec-aligned code comments if present.
      (Req: Caller-owned implementation tracking refresh, Ports and constructor)

## 4. CLI orchestration

- [x] 4.1 Refresh before `change status`
      `packages/cli/src/commands/change/status.ts`: `registerChangeStatus` action handler
      Approach: After `resolveCliContext`, call `await kernel.changes.refreshImplementationTracking.execute({ name })` immediately before `kernel.changes.status.execute({ name })`.
      (Req: Implementation tracking refresh before status load)

- [x] 4.2 Refresh before `change transition` (single call)
      `packages/cli/src/commands/change/transition.ts`: transition action handler
      Approach: Call `refreshImplementationTracking.execute({ name })` once at handler entry, before existing `status.execute` for `fromState` and before `transition.execute`. In `InvalidStateTransitionError` catch, keep `status.execute` for repair guide **without** a second refresh.
      (Req: Implementation tracking refresh before transition)

- [x] 4.3 Refresh before `change context`
      `packages/cli/src/commands/change/context.ts`: context action handler
      Approach: Call `refreshImplementationTracking.execute({ name })` before `kernel.changes.compile.execute(...)`, including when `--fingerprint` is provided.
      (Req: Implementation tracking refresh before context compilation)

## 5. Core unit tests

- [x] 5.1 Add `refresh-implementation-tracking.spec.ts`
      `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts`
      Approach: Mock `ChangeRepository` and `ImplementationDetector`; cover guard skip (no detector call), guard satisfied (detector called), new path tracked as `open`, existing `resolved` preserved, `ChangeNotFoundError`, and returned projection shape.
      (Req: all `core:refresh-implementation-tracking` verify scenarios)

- [x] 5.2 Update `get-status.spec.ts`
      `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: Remove autodetection/constructor-detector tests; add test that `GetStatus` does not call detector when change has historical implementing; update kernel-style constructor mocks to omit detector.
      (Req: Read-only implementation tracking; remove Implementation autodetection on status load)

- [x] 5.3 Update `transition-change.spec.ts`
      `packages/core/test/application/use-cases/transition-change.spec.ts`
      Approach: Remove `implementationDetector` from test doubles and any expectation that transition invokes detection.
      (Req: Caller-owned implementation tracking refresh)

- [x] 5.4 Update `compile-context.spec.ts`
      `packages/core/test/application/use-cases/compile-context.spec.ts`
      Approach: Remove detector from `CompileContext` construction in tests; drop autodetection expectations.
      (Req: Caller-owned implementation tracking refresh)

## 6. CLI unit tests

- [x] 6.1 Assert refresh ordering in status command tests
      `packages/cli/test/commands/change-status.spec.ts` (and `change/change-status.spec.ts` if duplicated)
      Approach: Extend kernel mock with `refreshImplementationTracking: { execute: vi.fn().mockResolvedValue({ implementationTracking: { trackedFiles: [], links: [] } }) }`; assert it is called before `status.execute` with `{ name }`.
      (Req: Implementation tracking refresh before status load — CLI verify)

- [x] 6.2 Assert refresh ordering in transition command tests
      `packages/cli/test/commands/change-transition.spec.ts`
      Approach: Mock `refreshImplementationTracking.execute`; assert called once on success path before `transition.execute`; on `InvalidStateTransitionError` path assert repair `status.execute` runs without a second refresh call.
      (Req: Implementation tracking refresh before transition — CLI verify)

- [x] 6.3 Assert refresh before compile in context command tests
      `packages/cli/test/commands/change/context` or equivalent context test file
      Approach: Mock refresh + compile; assert refresh runs before `compile.execute`; add case with `--fingerprint` still refreshing first.
      (Req: Implementation tracking refresh before context compilation — CLI verify)

- [x] 6.4 Fix kernel mocks project-wide for new surface
      `packages/cli/test/**` (files mocking `Kernel.changes`)
      Approach: Add `refreshImplementationTracking: { execute: vi.fn().mockResolvedValue(...) }` wherever `kernel.changes` is partially mocked to prevent undefined access in unrelated command tests.
      (Req: Kernel surface)

## 7. Manual verification

- [x] 7.1 E2E: status shows freshly detected files
      CLI: `node packages/cli/dist/index.js change status <name> --implementation`
      Approach: Use a change that has entered `implementing`; modify a file in the worktree; confirm new path appears under Implementation without running `change implementation` subcommands.
      (Req: CLI refresh + GetStatus projection — design Testing § Manual)

- [x] 7.2 E2E: context and transition see refreshed tracking
      CLI: `change context <name> implementing`, then `change transition <name> --next` (or explicit step)
      Approach: Confirm commands succeed and tracked-file state matches post-status refresh; force invalid transition and confirm repair guide renders without requiring a second manual refresh.
      (Req: CLI orchestration — design Testing § Manual)

## 8. Spec metadata (post-implementation)

- [x] 8.1 Regenerate spec-lock for new use case
      `specs/core/refresh-implementation-tracking/spec-lock.json`
      Approach: Deferred to archive — `spec-lock.json` and metadata for `core:refresh-implementation-tracking` are materialized automatically when the change is archived (implementation links are already confirmed in the change).
      (Req: design — Spec metadata)

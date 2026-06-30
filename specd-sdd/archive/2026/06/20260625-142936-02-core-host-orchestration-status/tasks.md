# Tasks: 02-core-host-orchestration-status

## 1. GetStatus orchestration (P0a)

- [x] 1.1 Add `refreshImplementationTracking` to `GetStatusInput`
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatusInput` — add optional `readonly refreshImplementationTracking?: boolean`
      Approach: extend interface only; document default-true semantics in JSDoc on the field and `execute()`
      (Req: Accepts a change name as input)

- [x] 1.2 Inject `RefreshImplementationTracking` into `GetStatus`
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus` constructor — add `refreshImplementationTracking: RefreshImplementationTracking` parameter stored as `_refresh`
      Approach: follow existing constructor pattern (`_changes`, `_schemaProvider`, etc.); add `@param` JSDoc
      (Req: Constructor dependencies)

- [x] 1.3 Implement active-only pre-read refresh in `GetStatus.execute`
      `packages/core/src/application/use-cases/get-status.ts`: `execute()` — when `input.refreshImplementationTracking !== false`, call `this._changes.get(name)` and if non-null `await this._refresh.execute({ name })` before existing load/projection logic
      Approach: guard with `!== false` so omitted/`true` refresh; draft-only path must not refresh; never call `ImplementationDetector` directly
      (Req: Optional pre-read implementation tracking refresh)

- [x] 1.4 Wire refresh collaborator in `createGetStatus`
      `packages/core/src/composition/use-cases/get-status.ts`: `createGetStatus` — construct `RefreshImplementationTracking` via existing factory/deps and pass into `new GetStatus(...)`
      Approach: reuse same adapter wiring as `createRefreshImplementationTracking` (change repo, archive repo, detector, file reader)
      (Req: Constructor dependencies)

## 2. TransitionChange orchestration (P0b)

- [x] 2.1 Add `refreshImplementationTrackingBefore` to `TransitionChangeInput`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChangeInput` — add optional `readonly refreshImplementationTrackingBefore?: boolean`
      Approach: extend interface; JSDoc default-true semantics
      (Req: Input contract)

- [x] 2.2 Inject `RefreshImplementationTracking` into `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange` constructor — add refresh collaborator parameter
      Approach: store as private readonly field; update `@param` JSDoc and Dependencies requirement coverage
      (Req: Dependencies)

- [x] 2.3 Implement pre-transition refresh in `TransitionChange.execute`
      `packages/core/src/application/use-cases/transition-change.ts`: `execute()` — after change existence check, when `input.refreshImplementationTrackingBefore !== false`, `await this._refresh.execute({ name: input.name })` before lifecycle evaluation/hooks/mutate
      Approach: delegate to refresh use case only; no detector imports
      (Req: Optional pre-transition implementation tracking refresh)

- [x] 2.4 Wire refresh collaborator in `createTransitionChange`
      `packages/core/src/composition/use-cases/transition-change.ts`: `createTransitionChange` — pass `RefreshImplementationTracking` into `TransitionChange` constructor
      Approach: share factory wiring with get-status path where possible
      (Req: Dependencies)

## 3. CLI thinning

- [x] 3.1 Remove status command refresh prelude
      `packages/cli/src/commands/change/status.ts`: action handler — delete `repo.get` + `refreshImplementationTracking.execute` block; call `kernel.changes.status.execute({ name })` directly
      Approach: no replacement refresh logic in CLI
      (Req: Delegates refresh policy to GetStatus)

- [x] 3.2 Remove transition command refresh prelude
      `packages/cli/src/commands/change/transition.ts`: action handler — delete manual refresh block before first `GetStatus`
      Approach: rely on `TransitionChange` default refresh
      (Req: Delegates refresh policy to TransitionChange)

- [x] 3.3 Pass `refreshImplementationTracking: false` on auxiliary transition reads
      `packages/cli/src/commands/change/transition.ts`: pre-transition and repair-guide `GetStatus` calls — add `refreshImplementationTracking: false`
      Approach: only the initial state read and `InvalidStateTransitionError` diagnostic read opt out; `TransitionChange` owns the single refresh
      (Req: Delegates refresh policy to TransitionChange — pre-transition and repair-guide scenarios)

## 4. Tests

- [x] 4.1 GetStatus refresh unit tests
      `packages/core/test/application/use-cases/get-status.spec.ts`: new scenarios — default refresh on active change, opt-out false, draft skip, no direct detector
      Approach: mock `RefreshImplementationTracking.execute`; spy must be called/not called per scenario
      (Req: Optional pre-read implementation tracking refresh)

- [x] 4.2 TransitionChange refresh unit tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`: new scenarios — default refresh, opt-out false, no direct detector
      Approach: mock refresh collaborator before transition assertions
      (Req: Optional pre-transition implementation tracking refresh)

- [x] 4.3 CLI status command test — no direct refresh
      `packages/cli/test/commands/change-status.spec.ts`: assert handler never calls `kernel.changes.refreshImplementationTracking.execute`
      Approach: mock kernel with spies on `status.execute` and `refreshImplementationTracking.execute`
      (Req: Delegates refresh policy to GetStatus)

- [x] 4.4 CLI transition command tests — no double refresh
      `packages/cli/test/commands/change-transition.spec.ts`: assert no direct refresh call; `status.execute` receives `refreshImplementationTracking: false` on pre-transition and repair paths
      Approach: inspect mock call arguments for both success and `InvalidStateTransitionError` paths
      (Req: Delegates refresh policy to TransitionChange)

## 5. Documentation

- [x] 5.1 Update core docs for host orchestration defaults
      `docs/core/` (GetStatus / TransitionChange pages if present) — document default refresh behaviour and opt-out input fields
      Approach: note CLI no longer performs manual refresh; cross-link `RefreshImplementationTracking`
      (Req: Default orchestration by host use cases)

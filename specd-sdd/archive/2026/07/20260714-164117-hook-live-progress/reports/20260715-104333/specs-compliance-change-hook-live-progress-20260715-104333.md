# Spec Compliance Audit: hook-live-progress

- Mode: specific change
- Change: `hook-live-progress`
- Timestamp: `20260715-104333`
- Graph status: fresh (`stale: false`, ref `aa9c8ae3`)
- Scope:
  - `core:hook-runner-port`
  - `core:run-step-hooks`
  - `cli:change-run-hooks`
  - `cli:change-transition`

## Summary

Verification status: failed.

The implementation broadly matches the intended live-progress design:

- `HookRunner` exposes additive progress events for output and heartbeat.
- `NodeHookRunner` streams subprocess output and emits heartbeats.
- `RunStepHooks` relays progress to callers.
- `change run-hooks` and `change transition` use a shared presenter and structured stdout streams for `json|toon`.
- Automated tests pass for the touched runner/use-case/CLI surfaces.

However, two concrete discrepancies remain between the merged specs and the current implementation.

## Findings

### 1. `RunStepHooks` still sets `failedHook` for fail-soft post phases

- Severity: high
- Spec:
  - `core:run-step-hooks`
  - Requirement: `Result shape`
  - Merged contract says `failedHook` is only populated for pre-hook fail-fast failures and is `null` otherwise.
- Implementation:
  - [packages/core/src/application/use-cases/run-step-hooks.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/run-step-hooks.ts:282)
  - [packages/core/src/application/use-cases/run-step-hooks.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/run-step-hooks.ts:286)
- Evidence:
  - In `phase === 'post'`, the implementation stores the first failed hook in `failedHook` instead of leaving it `null`.
  - The test suite still asserts the old behavior:
    - [packages/core/test/application/use-cases/run-step-hooks.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/run-step-hooks.spec.ts:390)
- Impact:
  - Violates the merged `RunStepHooks` contract.
  - Leaks fail-fast semantics into fail-soft consumers.
  - Can cause downstream JSON/TOON consumers of `change run-hooks` post phases to receive `failedHook` when the spec says they must inspect the full `hooks` array instead.
- Likely fix direction:
  - Keep `failedHook` exclusive to pre-phase aborts.
  - Update the failing post-phase test expectation accordingly.

### 2. `change transition` still exits hook failures as code `2`, but merged spec requires `1`

- Severity: high
- Spec:
  - `cli:change-transition`
  - Requirement: `Post-hook failure warning`
  - Requirement: `Invalid transition error`
  - Merged contract says hook failures abort the transition through the normal transition error path with exit code `1`, not the `run-hooks` hook-failure code `2`.
- Implementation:
  - [packages/cli/src/handle-error.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/handle-error.ts:171)
  - [packages/core/src/application/use-cases/transition-change.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/transition-change.ts:345)
- Evidence:
  - `TransitionChange` throws `HookFailedError` when transition hook execution fails.
  - `handleError()` maps any `HookFailedError` to `exitCode = 2`.
  - CLI tests still codify that old behavior:
    - [packages/cli/test/commands/change-transition.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-transition.spec.ts:151)
    - [packages/cli/test/commands/change-transition.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-transition.spec.ts:193)
- Impact:
  - `change transition` currently behaves like `change run-hooks` for hook-failure exit codes, which contradicts the merged transition spec.
  - Machine consumers will observe a different failure class than the one now documented.
- Likely fix direction:
  - Route transition hook failures through the transition command’s exit-1 contract.
  - Update CLI tests to assert `1` for transition hook failures.

## Coverage Notes

- Relevant automated coverage exists and currently passes:
  - [packages/core/test/infrastructure/node/hook-runner.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/node/hook-runner.spec.ts:1)
  - [packages/core/test/application/use-cases/run-step-hooks.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/run-step-hooks.spec.ts:1)
  - [packages/core/test/application/use-cases/transition-change.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/transition-change.spec.ts:1)
  - [packages/cli/test/commands/change-run-hooks.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-run-hooks.spec.ts:1)
  - [packages/cli/test/commands/change-transition.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-transition.spec.ts:1)
  - [packages/cli/test/commands/\_hook-progress-presenter.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/_hook-progress-presenter.spec.ts:1)
- The two findings above are not uncovered holes; they are currently enforced by implementation and tests in a way that no longer matches the merged spec.

## Global / Dependency Compliance

No additional contradictions were found against the relevant global and dependency-level constraints in this change:

- Architecture layering remains consistent:
  - shell/process concerns stay in infrastructure (`NodeHookRunner`)
  - progress contracts stay in ports/use cases
  - CLI rendering remains in `packages/cli`
- Shared CLI rendering is centralized instead of duplicated.
- The structured-stream serializer remains ESM-safe and additive.

## Conclusion

This change should return to implementation.

Classification: implementation-only failure.

The specs and merged verification scenarios describe a coherent final contract, but the code and tests still retain two old behaviors:

1. `RunStepHooks` post-phase `failedHook` handling
2. `change transition` hook-failure exit code mapping

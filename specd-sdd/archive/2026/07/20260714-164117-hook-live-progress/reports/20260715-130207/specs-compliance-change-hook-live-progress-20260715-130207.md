# Spec Compliance Audit

## Scope

- Mode: `--change hook-live-progress`
- Change: `hook-live-progress`
- State at audit time: `verifying`
- Specs audited:
  - `core:hook-runner-port`
  - `core:run-step-hooks`
  - `cli:change-run-hooks`
  - `cli:change-transition`

## Inputs Reviewed

- Merged change specs via `changes spec-preview`
- Verification context via `changes context hook-live-progress verifying --include-change-specs --follow-deps --depth 1 --rules --constraints --scenarios`
- Target implementation files:
  - `packages/core/src/application/ports/hook-runner.ts`
  - `packages/core/src/infrastructure/node/hook-runner.ts`
  - `packages/core/src/application/use-cases/run-step-hooks.ts`
  - `packages/core/src/application/use-cases/transition-change.ts`
  - `packages/cli/src/commands/change/_hook-progress-presenter.ts`
  - `packages/cli/src/commands/change/run-hooks.ts`
  - `packages/cli/src/commands/change/transition.ts`
  - `packages/cli/src/formatter.ts`
- Target tests:
  - `packages/core/test/infrastructure/node/hook-runner.spec.ts`
  - `packages/core/test/application/use-cases/run-step-hooks.spec.ts`
  - `packages/core/test/application/use-cases/transition-change.spec.ts`
  - `packages/cli/test/commands/_hook-progress-presenter.spec.ts`
  - `packages/cli/test/commands/change-run-hooks.spec.ts`
  - `packages/cli/test/commands/change-transition.spec.ts`
  - `packages/cli/test/formatter.spec.ts`
  - `packages/cli/test/commands/change.spec.ts`

## Environment Checks

- Code graph status: fresh
- Graph stale flag: `false`
- Change review required: `false`
- Approval gates:
  - spec: `false`
  - signoff: `false`

## Verification Evidence

### Focused test execution

- `pnpm --filter @specd/core exec vitest run test/infrastructure/node/hook-runner.spec.ts test/application/use-cases/run-step-hooks.spec.ts test/application/use-cases/transition-change.spec.ts`
  - Result: `3` files passed, `106` tests passed
- `pnpm --filter @specd/cli exec vitest run test/commands/_hook-progress-presenter.spec.ts test/commands/change-run-hooks.spec.ts test/commands/change-transition.spec.ts test/formatter.spec.ts test/commands/change.spec.ts`
  - Result: `5` files passed, `93` tests passed

### Scenario alignment summary

- `core:hook-runner-port`
  - `HookRunner` remains an interface.
  - `run()` now accepts an optional progress callback and still resolves `Promise<HookResult>`.
  - `NodeHookRunner` streams stdout/stderr progress, emits heartbeats for quiet long-running hooks, and still returns complete final stdout/stderr plus exit code.
  - Focused tests cover stdout/stderr capture, progress relay, heartbeat emission, unknown variable preservation, template expansion, and always-resolve semantics.

- `core:run-step-hooks`
  - `RunStepHooks` constructor includes the external runner registry required by the merged spec.
  - Progress contract now includes `hook-output` and `hook-heartbeat` in addition to `hook-start` and `hook-done`.
  - Shell runner progress is relayed without changing fail-fast/fail-soft behavior.
  - Final result contract uses `failedHooks` consistently, including pre and post semantics.
  - Focused tests cover instruction-hook exclusion, external hook dispatch, `--only` filtering, archived fallback, progress propagation, fail-fast, fail-soft, and `failedHooks` ordering.

- `cli:change-run-hooks`
  - The command uses a shared presenter helper instead of bespoke rendering.
  - Text mode keeps streaming progress on `stderr` and final summary on `stdout`.
  - Structured modes emit newline-delimited stdout stream records with `stream: "hook-progress"` and terminal `stream: "run-hooks"` completion records.
  - Hook failures keep exit code `2` and expose `failedHooks` in structured completion output.
  - Focused tests cover text streaming, final summary shape, structured stream records, and failed post-hook `failedHooks` behavior.

- `cli:change-transition`
  - The command shares the same hook-progress presenter contract as `change run-hooks`.
  - Text mode preserves hook visibility and the `[all hooks done]` separator.
  - Structured modes emit newline-delimited stdout stream records and terminal `stream: "change-transition"` completion records.
  - Hook-triggered failures use exit code `2`, matching the merged change spec.
  - Focused tests cover success/failure structured records, shared progress rendering expectations, and hook-failure exit behavior.

## Findings

No compliance findings were identified in the audited scope.

## Residual Risks

- The broad pre-verifying hook run surfaced an unrelated-looking `@specd/code-graph:test` unhandled rejection line (`ERR_IPC_CHANNEL_CLOSED`) inside cached turbo output, but the hook command still exited successfully and the focused change-specific tests for this audit all passed. This does not currently contradict the audited change specs, but it may merit separate investigation if it becomes reproducible outside cached aggregate runs.

## Conclusion

- Spec/implementation compliance status for `hook-live-progress`: clean
- Change-scoped verification status: pass
- Recommended workflow action: proceed

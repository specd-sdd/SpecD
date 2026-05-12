# Tasks: cli-change-next-flag

## 1. CLI transition command

- [x] 1.1 Add `--next` command shape and argument guards
      `packages/cli/src/commands/change/transition.ts`: `registerChangeTransition` — change the command signature from required `<step>` to optional `[step]`, add the `--next` boolean option, and reject invocations that provide neither target nor both target forms
      Approach: keep validation in the CLI adapter with `cliError(...)`; enforce mutual exclusivity before any transition logic so the command fails deterministically
      (Req: Command signature)
- [x] 1.2 Resolve the next logical lifecycle target in the CLI
      `packages/cli/src/commands/change/transition.ts`: local helpers around the command action — map `drafting`, `designing`, `ready`, `spec-approved`, `implementing`, `verifying`, and `done` to the next transitionable state
      Approach: add pure local helpers such as `resolveRequestedTarget(...)` and `resolveNextTarget(...)`; load current state from `kernel.changes.status.execute({ name })` and delegate the resolved target to `kernel.changes.transition.execute(...)`
      (Req: Next-transition resolution)
- [x] 1.3 Fail clearly for non-transitionable `--next` states
      `packages/cli/src/commands/change/transition.ts`: `--next` resolution path — reject `pending-spec-approval`, `pending-signoff`, and `archivable` with explanatory `error:` messages instead of inventing synthetic transition targets
      Approach: keep these failures in the CLI because they are command UX decisions; use targeted `cliError(...)` messages that explain the human-approval or archive boundary without triggering approval actions automatically
      (Req: Next-transition resolution, Invalid transition error)

## 2. Core transition failure semantics

- [x] 2.1 Extend `InvalidStateTransitionError` with approval-required reasons
      `packages/core/src/domain/errors/invalid-state-transition-error.ts`: `TransitionFailureReason` and `buildMessage(...)` — add `{ type: 'approval-required', gate: 'spec' | 'signoff' }` and generate human-readable messages for both gate types
      Approach: extend the existing structured union rather than introducing a new error class so `handleError` and structured output keep working unchanged
      (Req: Human-approval pending states produce explicit transition failures)
- [x] 2.2 Guard pending approval states before entity delegation
      `packages/core/src/application/use-cases/transition-change.ts`: `execute()` — throw `InvalidStateTransitionError(..., { type: 'approval-required', gate: ... })` when the current state is `pending-spec-approval` or `pending-signoff` and the requested target is anything other than `designing`
      Approach: place the guard after target resolution and before `change.transition(...)`; preserve `designing` as the only allowed escape hatch so redesign workflows still function
      (Req: Human-approval pending states produce explicit transition failures)

## 3. Automated tests

- [x] 3.1 Add CLI tests for `--next` success and validation
      `packages/cli/test/commands/change-transition.spec.ts`: new cases in the existing suite — cover `--next` from `drafting`, `--next` from `ready` with spec approval enabled, and rejection of explicit `<step>` combined with `--next`
      Approach: keep using mocked `status.execute` and `transition.execute`; assert both the resolved target passed to the use case and the visible stdout/stderr behaviour
      (Req: Command signature, Next-transition resolution)
- [x] 3.2 Add CLI tests for surfaced approval-boundary errors
      `packages/cli/test/commands/change-transition.spec.ts`: invalid transition coverage — assert that `--next` from `pending-spec-approval` and explicit blocked transitions from `pending-signoff` surface the explanatory stderr messages
      Approach: reject from the command path with `InvalidStateTransitionError` carrying the new structured reason where applicable, then assert `handleError` output remains exit code `1`
      (Req: Invalid transition error, Next-transition resolution)
- [x] 3.3 Add core tests for the new reason type
      `packages/core/test/domain/errors/invalid-state-transition-error.spec.ts`: new unit cases for `approval-required/spec` and `approval-required/signoff`
      Approach: construct the error directly, assert both the structured `reason` payload and the generated human-readable message
      (Req: Human-approval pending states produce explicit transition failures)
- [x] 3.4 Add core use-case tests for pending approval guards
      `packages/core/test/application/use-cases/transition-change.spec.ts`: add pending-spec-approval and pending-signoff fixtures — assert blocked forward transitions throw the new reason and that `designing` remains allowed
      Approach: model the states through history events, call `execute(...)` with blocked targets such as `spec-approved` and `signed-off`, and inspect the thrown `InvalidStateTransitionError.reason`
      (Req: Human-approval pending states produce explicit transition failures)

## 4. Verification

- [x] 4.1 Run targeted automated test suites
      `packages/cli/test/commands/change-transition.spec.ts`, `packages/core/test/domain/errors/invalid-state-transition-error.spec.ts`, `packages/core/test/application/use-cases/transition-change.spec.ts` — execute the focused Vitest commands for CLI and core
      Approach: run `pnpm --filter @specd/cli test -- change-transition`, `pnpm --filter @specd/core test -- invalid-state-transition-error`, and `pnpm --filter @specd/core test -- transition-change`; fix any regressions before broader verification
      (Req: Command signature, Next-transition resolution, Invalid transition error, Human-approval pending states produce explicit transition failures)
- [x] 4.2 Perform manual end-to-end command checks
      `packages/cli/src/commands/change/transition.ts`: runtime behaviour — manually verify `--next` from `drafting`, routed `ready -> pending-spec-approval`, blocked `pending-spec-approval`, and blocked `archivable`
      Approach: use `node packages/cli/dist/index.js change transition <name> --next` against representative change states and confirm success paths, exit code `1`, and explanatory stderr text match the verify scenarios
      (Req: Next-transition resolution, Invalid transition error)

## 5. Documentation

- [x] 5.1 Update CLI reference for `change transition`
      `docs/cli/cli-reference.md`: `change transition` section — document optional `[step]`, the `--next` flag, examples of forward navigation, and the states where `--next` fails instead of auto-transitioning
      Approach: keep the reference aligned with the CLI spec and examples implemented in `transition.ts`; describe behaviour, flags, and exit expectations without instructing approval automation
      (Req: Command signature, Next-transition resolution)
- [x] 5.2 Update core use-case and error docs
      `docs/core/use-cases.md`, `docs/core/errors.md`: `TransitionChange` and `InvalidStateTransitionError` entries — describe the new `approval-required` failure reason and how pending approval states are reported
      Approach: mirror the structured error semantics from core so human-facing docs stay consistent with `TransitionChange` and `InvalidStateTransitionError`
      (Req: Human-approval pending states produce explicit transition failures, Invalid transition error)

# Partial Compliance Findings - CLI

- **Change**: `custom-checks-and-resilient-hooks`
- **Batch**: `cli`
- **Audit Date**: 2026-10-01 15:26:00
- **Auditor**: Spec Compliance Auditor Subagent (`cli`)

---

## Summary of Findings

- **Total Specs Audited**: 1
  - [`cli:change-transition`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/cli/change-transition/spec.md) (Modified via Delta)
- **Total Requirements Audited**: 15
  - `Command signature` (3 scenarios)
  - `Next-transition resolution` (8 scenarios)
  - `Validity-aware transition guidance` (3 scenarios)
  - `Delegates refresh policy to TransitionChange` (3 scenarios)
  - `Approval-gate routing` (3 scenarios)
  - `Hook execution` (4 scenarios)
  - `Progress output` (4 scenarios)
  - `Transition hook observability` (1 scenario)
  - `Shared hook progress presentation` (1 scenario)
  - `Output on success` (3 scenarios)
  - `Post-hook failure warning` (2 scenarios)
  - `Invalid transition error` (2 scenarios)
  - `Incomplete tasks error` (2 scenarios)
  - `Check progress rendering` (2 scenarios)
  - `Unsatisfied requires error` (2 scenarios)
- **Total Scenarios Audited**: 43
- **Conformant Requirements**: 15 / 15 (100%)
- **Conformant Scenarios**: 43 / 43 (100%)
- **Discrepancies / Drift**: 0
- **Missing Tests**: 0
- **Global Specs Consistency**: 100% compliant with [`architecture`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/architecture/spec.md), [`conventions`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/conventions/spec.md), [`testing`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/testing/spec.md), and [`error-handling-conventions`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/error-handling-conventions/spec.md)
- **Test Suite Results**: 47 / 47 passing tests in [`packages/cli/test/commands/change/transition.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts) (46ms execution)
- **Overall Status**: COMPLIANT

---

## Per-Spec Assessment

### 1. `cli:change-transition`

- **Base Spec Document**: [`specs/cli/change-transition/spec.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/cli/change-transition/spec.md)
- **Base Verification Document**: [`specs/cli/change-transition/verify.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/cli/change-transition/verify.md)
- **Delta Documents**:
  - Spec Delta: [`deltas/cli/change-transition/spec.md.delta.yaml`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/cli/change-transition/spec.md.delta.yaml)
  - Verify Delta: [`deltas/cli/change-transition/verify.md.delta.yaml`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/cli/change-transition/verify.md.delta.yaml)
- **Implementation Files**:
  - [`packages/cli/src/commands/change/transition.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts)
  - [`packages/cli/src/commands/change/_check-progress-presenter.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/_check-progress-presenter.ts)
  - [`packages/cli/src/commands/change/_hook-progress-presenter.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/_hook-progress-presenter.ts)
- **Test Files**:
  - [`packages/cli/test/commands/change/transition.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts) (47 tests, 100% passing)
  - [`packages/cli/test/commands/_hook-progress-presenter.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/_hook-progress-presenter.spec.ts) (8 tests, 100% passing)

---

#### Requirement Verification Details

#### 1. Requirement: Command signature (Modified by Delta)

- **Spec Requirements**:
  - Invoked as `specd change transition [name] [target]`.
  - If `name` is omitted, defaults to active workspace change.
  - If `target` is omitted, attempts to resolve the next logical transition.
  - MUST accept a `--skip-checks <ids>` option accepting a comma-separated list of check IDs.
  - MUST maintain backward compatibility with legacy flags:
    - `--allow-out-of-scope` appends `impl.linksInScope` to `skipChecks`.
    - `--allow-overlap` appends `spec.overlap` to `skipChecks`.
  - The CLI adapter MUST pass the compiled `skipChecks` array directly to `TransitionChangeInput.skipChecks`.
- **Implementation**:
  - Registered in [`packages/cli/src/commands/change/transition.ts#L276-L295`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L276-L295) with `--skip-checks <ids>`, `--allow-out-of-scope`, and `--allow-overlap`.
  - Parsing and translation in [`packages/cli/src/commands/change/transition.ts#L334-L346`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L334-L346):
    - Splits comma-separated values, trims whitespace, filters empty strings, and deduplicates via `Set<string>`.
    - Appends `'impl.linksInScope'` if `allowOutOfScope === true`.
    - Appends `'spec.overlap'` if `allowOverlap === true`.
  - Passes `skipChecks: Array.from(skipChecks)` to `kernel.changes.transition.execute` ([`transition.ts#L369`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L369)).
- **Verification Scenarios & Test Coverage**:
  - `CLI accepts --skip-checks with comma-separated list`: Covered in [`transition.spec.ts#L1356-L1381`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1356-L1381).
  - `CLI translates legacy --allow-out-of-scope to skipChecks`: Covered in [`transition.spec.ts#L94-L118`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L94-L118).
  - `CLI translates legacy --allow-overlap to skipChecks`: Covered in [`transition.spec.ts#L1383-L1407`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1383-L1407).
  - Additional deduplication and whitespace robustness: Covered in [`transition.spec.ts#L1409-L1434`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1409-L1434) and [`L1436-L1463`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1436-L1463).
- **Status**: ✓ CONFORMANT

---

#### 2. Requirement: Next-transition resolution

- **Spec Requirements**:
  - When `--next` is used, CLI MUST call `TransitionChange.execute` with `to: 'next'`.
  - Core MUST resolve the happy-path next lifecycle state.
  - The CLI MUST NOT maintain a from→to routing table and MUST NOT treat `GetStatus.nextAction` as that resolution.
  - When Core rejects `to: 'next'` (`HappyPathNextUnavailableError`), the command MUST exit code 1 with an explanatory `error:` message to stderr.
- **Implementation**:
  - In [`transition.ts#L358-L359`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L358-L359): `requestedTarget: ChangeState | 'next' = opts.next === true ? 'next' : (step as ChangeState)`.
  - Passes `to: requestedTarget` directly to `kernel.changes.transition.execute` ([`transition.ts#L367`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L367)).
  - Generic error handler `handleError(err)` catches `HappyPathNextUnavailableError` and exits with code 1 and descriptive stderr message.
- **Verification Scenarios & Test Coverage**:
  - `Next flag advances designing to ready`: Covered in [`transition.spec.ts#L68-L92`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L68-L92).
  - `Next flag from ready requests implementing and stays in ready when spec gate on`: Covered in [`transition.spec.ts#L211-L233`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L211-L233) and [`L329-L369`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L329-L369).
  - `Next flag fails in pending spec approval state`: Covered in [`transition.spec.ts#L789-L812`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L789-L812).
  - `Next flag fails in pending signoff state`: Covered in [`transition.spec.ts#L814-L837`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L814-L837).
  - `Next flag fails in archivable state`: Covered in [`transition.spec.ts#L839-L862`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L839-L862).
  - `Next flag from signed-off maps to archivable`: Covered in [`transition.spec.ts#L371-L389`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L371-L389).
  - `CLI does not keep a from-to next table`: Covered in [`transition.spec.ts#L68-L92`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L68-L92).
  - `Shared presentation with run-hooks is not the same JSON stream`: Covered in [`transition.spec.ts#L496-L580`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L496-L580).
- **Status**: ✓ CONFORMANT

---

#### 3. Requirement: Validity-aware transition guidance

- **Spec Requirements**:
  - Consumes canonical `GetStatus` or `TransitionChange` result without reconstructing gate or verification rules.
  - If reconciliation committed an automatic return, output shows new state, invalidated evidence, reason, and current next action.
  - CLI does not retry original transition automatically, does not expose restart flags, does not accept `verifying → verifying`.
  - Recommends verification in place when `verification.current` fails at exit boundary.
- **Implementation**:
  - In [`transition.ts#L145-L150`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L145-L150), renders `validityTextLines(validity, evidence)` from `GetStatus`.
  - In [`transition.ts#L168-L177`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L168-L177), renders `status.nextAction.command` and `status.nextAction.reason`.
  - No `--restart-verification` flag exists on the command.
- **Verification Scenarios & Test Coverage**:
  - `Exit check failure recommends verification in place`: Covered in [`transition.spec.ts#L1185-L1213`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1185-L1213).
  - `Repair command uses the real change name`: Covered in [`transition.spec.ts#L1465-L1495`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1465-L1495) (`/specd-implement my-change`).
  - `Committed recovery is not rendered as an edge error`: Covered in [`transition.spec.ts#L1312-L1353`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1312-L1353).
- **Status**: ✓ CONFORMANT

---

#### 4. Requirement: Delegates refresh policy to TransitionChange

- **Spec Requirements**:
  - MUST NOT call `RefreshImplementationTracking` or `ImplementationDetector` directly.
  - Pre-transition status read MUST pass `refreshImplementationTracking: false`.
  - `TransitionChange` invoked with default `refreshImplementationTrackingBefore`.
  - Repair guide status read MUST pass `refreshImplementationTracking: false`.
- **Implementation**:
  - Pre-transition read: [`transition.ts#L349-L352`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L349-L352):
    ```ts
    const statusResult = await kernel.changes.status.execute({
      name,
      refreshImplementationTracking: false,
    })
    ```
  - Repair guide status read: [`transition.ts#L392-L395`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L392-L395):
    ```ts
    const status = await kernel.changes.status.execute({
      name,
      refreshImplementationTracking: false,
    })
    ```
  - Direct calls to `refreshImplementationTracking` or `ImplementationDetector` are completely absent from `transition.ts`.
- **Verification Scenarios & Test Coverage**:
  - `Transition command does not call refresh directly`: Covered in [`transition.spec.ts#L82`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L82) and [`L746`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L746).
  - `Pre-transition GetStatus skips refresh`: Covered in [`transition.spec.ts#L83-L86`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L83-L86).
  - `Repair guide GetStatus does not double-refresh`: Covered in [`transition.spec.ts#L747-L754`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L747-L754).
- **Status**: ✓ CONFORMANT

---

#### 5. Requirement: Approval-gate routing

- **Spec Requirements**:
  - The CLI MUST NOT pass approval gate flags to `TransitionChange.execute`.
  - The CLI MUST NOT rewrite `implementing` to `pending-spec-approval` or `archivable` to `pending-signoff`.
  - Failed approval checks stay in `ready` / `done`.
- **Implementation**:
  - In [`transition.ts#L364-L372`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L364-L372), only `name`, `to`, `skipHookPhases`, and `skipChecks` are passed. Approval flags are never passed.
  - The target requested by the user is passed as `to: requestedTarget` without any rewriting into pending states.
- **Verification Scenarios & Test Coverage**:
  - `Spec approval gate active`: Covered in [`transition.spec.ts#L235-L282`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L235-L282).
  - `Signoff gate active`: Covered in [`transition.spec.ts#L284-L327`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L284-L327).
  - `Transition execute omits approval flags`: Covered in [`transition.spec.ts#L138-L161`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L138-L161).
- **Status**: ✓ CONFORMANT

---

#### 6. Requirement: Hook execution

- **Spec Requirements**:
  - Runs hooks at step boundaries by default (source.post then target.pre, then state transition).
  - Both hook phases are fail-fast.
  - `--skip-hooks` with specific phases skips those phases (`source.pre`, `source.post`, `target.pre`, `target.post`).
  - `--skip-hooks all` skips all hook execution.
  - CLI maps `--skip-hooks` option to `skipHookPhases: Set<HookPhaseSelector>` on `TransitionChangeInput`.
- **Implementation**:
  - In [`transition.ts#L329-L332`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L329-L332):
    ```ts
    const skipHookPhases =
      opts.skipHooks !== undefined
        ? parseCommaSeparatedValues(opts.skipHooks, VALID_HOOK_PHASES, '--skip-hooks')
        : new Set<HookPhaseSelector>()
    ```
  - Passes `skipHookPhases` directly to `kernel.changes.transition.execute` ([`transition.ts#L368`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L368)).
- **Verification Scenarios & Test Coverage**:
  - `--skip-hooks all skips all hooks`: Covered in [`transition.spec.ts#L866-L892`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L866-L892).
  - `--skip-hooks target.pre skips only pre hooks`: Covered via comma-separated parser test in [`transition.spec.ts#L912-L937`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L912-L937).
  - `--skip-hooks source.post skips only post hooks`: Covered in [`transition.spec.ts#L912-L937`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L912-L937).
  - `--skip-hooks accepts comma-separated values`: Covered in [`transition.spec.ts#L912-L937`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L912-L937).
- **Status**: ✓ CONFORMANT

---

#### 7. Requirement: Progress output

- **Spec Requirements**:
  - Passes an `onProgress` callback that renders generic check progress in `text` format (to stderr) and structured stream records in `json` / `toon` (to stdout).
  - Predicate and effect checks share one bus: `check-start`, optional `check-progress`, `check-done`.
  - Hooks MUST appear on that bus (`Running pre hooks` / `Running post hooks`).
  - MUST NOT emit `stream: "hook-progress"` from `change transition`.
- **Implementation**:
  - In [`transition.ts#L216-L268`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L216-L268):
    ```ts
    const checkPresenter = createCheckProgressPresenter({
      format,
      streamName: 'change-transition',
      stream: format === 'text' ? process.stderr : process.stdout,
    })
    ```
  - Check events (`check-start`, `check-progress`, `check-done`) are routed to `checkPresenter.onEvent(evt)`.
  - In `json` / `toon`, records are written with `stream: 'change-transition'`.
- **Verification Scenarios & Test Coverage**:
  - `Text mode renders active hook status with recent output`: Covered in [`transition.spec.ts#L582-L640`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L582-L640).
  - `Text mode preserves completed hook history`: Covered in [`transition.spec.ts#L582-L640`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L582-L640).
  - `Text mode shows liveness for quiet hook`: Covered in [`transition.spec.ts#L610-L616,L637`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L610-L637) (`still running (5s)`).
  - `Structured formats emit progress on stdout`: Covered in [`transition.spec.ts#L496-L580`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L496-L580) (all lines use `stream: 'change-transition'`; none use `hook-progress`).
- **Status**: ✓ CONFORMANT

---

#### 8. Requirement: Transition hook observability

- **Spec Requirements**:
  - When hook execution exposes progress, surfaces progress during transition before hook exits.
  - Applies even when the transition ultimately fails before lifecycle state changes.
- **Implementation**:
  - `onProgress` callback is invoked synchronously during hook execution; [`checkPresenter`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/_check-progress-presenter.ts#L90-L113) immediately writes each progress line (`command:`, `| stdout`, `! stderr`, `still running`).
  - In [`transition.ts#L363-L372`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L363-L372), `onProgress` receives hook progress events before `kernel.changes.transition.execute` throws `HookFailedError`.
- **Verification Scenarios & Test Coverage**:
  - `Transition exposes hook progress before hook-triggered failure`: Covered in [`transition.spec.ts#L414-L474`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L414-L474).
- **Status**: ✓ CONFORMANT

---

#### 9. Requirement: Shared hook progress presentation

- **Spec Requirements**:
  - `change transition` MUST use generic check-progress presenter (`_check-progress-presenter.ts`).
  - `change run-hooks` MAY keep `_hook-progress-presenter.ts`.
  - The two commands MUST NOT advertise the same public JSON `stream` name.
- **Implementation**:
  - `transition.ts` exclusively instantiates `createCheckProgressPresenter` with `streamName: 'change-transition'` ([`transition.ts#L221-L225`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L221-L225)).
  - `_hook-progress-presenter.ts` uses `stream: 'hook-progress'` for `change run-hooks`.
- **Verification Scenarios & Test Coverage**:
  - `Transition check bus does not share hook-progress stream`: Covered in [`transition.spec.ts#L579`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L579) and [`L966-L972`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L966-L972).
- **Status**: ✓ CONFORMANT

---

#### 10. Requirement: Output on success

- **Spec Requirements**:
  - In `text`: prints `transitioned <name>: <from> → <to>` to stdout, process exits 0.
  - In `json` and `toon`: emits one terminal stdout stream record with:
    - `stream: "change-transition"`
    - `event.type: "complete"`
    - `event.result` containing `result: "ok"`, `name`, `from`, `to` (or `result: "failure"`, `blockers`, `nextAction` on failure).
- **Implementation**:
  - Text mode output: [`transition.ts#L374-L375`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L374-L375): `output('transitioned ${name}: ${fromState} → ${result.change.state}', 'text')`.
  - Structured mode output: [`transition.ts#L377-L388`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L377-L388) (success) and [`L401-L417`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L401-L417) (failure).
- **Verification Scenarios & Test Coverage**:
  - `Successful direct transition`: Covered in [`transition.spec.ts#L477-L494`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L477-L494).
  - `Structured success result is emitted as terminal complete record`: Covered in [`transition.spec.ts#L496-L580`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L496-L580).
  - `Structured failure result is emitted as terminal complete record`: Covered in [`transition.spec.ts#L1069-L1136`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1069-L1136).
- **Status**: ✓ CONFORMANT

---

#### 11. Requirement: Post-hook failure warning

- **Spec Requirements**:
  - Both hook phases fail-fast; hook failure causes exit code 2 and prints `error:` message to stderr instead of a separate post-hook warning state.
  - Failure output leaves caller with visible execution context identifying the hook that failed.
- **Implementation**:
  - When `HookFailedError` is thrown, `isRepairGuideError(err)` returns `false` ([`transition.ts#L81-L102`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L81-L102)).
  - Error bubbles to `handleError(err, opts.format)` ([`transition.ts#L423`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L423)), which maps `HookFailedError` to exit code 2 and prints `error: <message>`.
- **Verification Scenarios & Test Coverage**:
  - `Hook failure exits with error instead of post-transition warning`: Covered in [`transition.spec.ts#L393-L412`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L393-L412).
  - `Hook failure leaves visible execution context`: Covered in [`transition.spec.ts#L414-L474`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L414-L474).
- **Status**: ✓ CONFORMANT

---

#### 12. Requirement: Invalid transition error (Modified by Delta)

- **Spec Requirements**:
  - Catches `CheckPredicateFailedError` and maps it onto the CLI Text Repair Guide.
  - Renders failure message, diagnostic code, and the check's gerund label.
  - If the check definition or result specifies a remediation `command`, the Repair Guide MUST present it under `command:`.
  - If the failed check allows bypass (`skippable: true`), the Repair Guide MUST suggest the exact bypass syntax: `Retry with --skip-checks <id> if an exception is granted`.
  - If the check is mandatory (`skippable: false`), no `bypass:` line SHALL be offered.
- **Implementation**:
  - Included in `isRepairGuideError`: [`transition.ts#L91,L98`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L91-L98) checks `err instanceof CheckPredicateFailedError || name === 'CheckPredicateFailedError'`.
  - In `writeTextRepairGuide` ([`transition.ts#L154-L166`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L154-L166)):
    ```ts
    if (err.name === 'CheckPredicateFailedError' || err instanceof CheckPredicateFailedError) {
      const cpErr = err as CheckPredicateFailedError
      process.stderr.write(`  check:   ${cpErr.label} (${cpErr.checkId})\n`)
      if (cpErr.command) {
        process.stderr.write(`  command: ${cpErr.command}\n`)
      } else if (status.nextAction?.command) {
        process.stderr.write(`  command: ${status.nextAction.command}\n`)
      }
      if (cpErr.skippable) {
        process.stderr.write(
          `  bypass:  Retry with --skip-checks ${cpErr.checkId} if an exception is granted\n`,
        )
      }
    }
    ```
  - When `cpErr.skippable === false`, the `if (cpErr.skippable)` branch is bypassed, ensuring zero `bypass:` output for mandatory checks.
- **Verification Scenarios & Test Coverage**:
  - `CheckPredicateFailedError renders Repair Guide with command and bypass`: Covered in [`transition.spec.ts#L1465-L1495`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1465-L1495) and [`L1587-L1618`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1587-L1618).
  - `Mandatory check failure does not offer bypass in Repair Guide`: Covered in [`transition.spec.ts#L1497-L1527`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1497-L1527).
- **Status**: ✓ CONFORMANT

---

#### 13. Requirement: Incomplete tasks error

- **Spec Requirements**:
  - If transitioning toward a step whose `workflow.taskCompletion` predicate fails (e.g. `implementing → verifying`) and any gated artifact has incomplete task items, command exits with code 1 and prints `error:` message to stderr naming blocking artifact.
  - Status for that same change MUST already have omitted `verifying` from `availableTransitions`.
- **Implementation**:
  - Kernel raises `InvalidStateTransitionError` on task completion failure, which is caught by `isRepairGuideError` ([`transition.ts#L87`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L87)).
  - Renders Repair Guide with blockers including `INCOMPLETE_TASKS` and exits code 1.
  - `task-completion-failed` progress event handled in [`transition.ts#L246-L255`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L246-L255).
- **Verification Scenarios & Test Coverage**:
  - `Unchecked checkboxes block verifying`: Covered in [`transition.spec.ts#L1036-L1067`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1036-L1067).
  - `Status omitted verifying before the failed transition`: Covered in [`transition.spec.ts#L977-L1034`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L977-L1034).
- **Status**: ✓ CONFORMANT

---

#### 14. Requirement: Check progress rendering

- **Spec Requirements**:
  - Rendered in text mode as:
    ```text
    <label> (<id>)
      …optional check-progress lines…
    ✓ <label>
    # or
    ✗ <label>: <reason>
    ```
  - Labels are gerund phrases from each check.
  - The CLI MUST NOT print an `Executing:` prefix.
  - Hooks MUST appear on this same bus (`Running pre hooks` / `Running post hooks`).
- **Implementation**:
  - In [`_check-progress-presenter.ts#L96-L113`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/_check-progress-presenter.ts#L96-L113):
    - `check-start`: `${event.label} (${event.id})\n`
    - `check-progress`: `writeProgressLine(event)`
    - `check-done`: `✓ ${event.label}\n` on pass, `✗ ${event.label}: ${event.reason}\n` on fail.
  - Zero occurrence of `Executing:` prefix.
- **Verification Scenarios & Test Coverage**:
  - `Predicate progress uses gerund label`: Covered in [`transition.spec.ts#L642-L674`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L642-L674).
  - `Hook progress uses Running hooks labels`: Covered in [`transition.spec.ts#L414-L474`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L414-L474) and [`L582-L640`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L582-L640).
- **Status**: ✓ CONFORMANT

---

#### 15. Requirement: Unsatisfied requires error

- **Spec Requirements**:
  - If target workflow step has `requires` and any required artifact is not `complete` or `skipped`, command exits with code 1 and prints an `error:` message to stderr.
  - Repair guide uses blocker and next-action data from Core.
- **Implementation**:
  - Handled in `isRepairGuideError` catching `InvalidStateTransitionError` ([`transition.ts#L87`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L87)).
  - Renders `status.blockers` and `status.nextAction` in [`writeTextRepairGuide`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/src/commands/change/transition.ts#L129-L181).
- **Verification Scenarios & Test Coverage**:
  - `Requires blocker is surfaced to the user`: Covered in [`transition.spec.ts#L705-L755`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L705-L755).
  - `Repair guide uses blocker and next-action data from core`: Covered in [`transition.spec.ts#L705-L755`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L705-L755) and [`L1184-L1213`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/cli/test/commands/change/transition.spec.ts#L1184-L1213).
- **Status**: ✓ CONFORMANT

---

## Global Specs Consistency Review

1. **[`default:_global/architecture`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/architecture/spec.md)**:
   - **Delivery Layer Role**: `packages/cli` acts solely as an adapter, delegating all domain logic and lifecycle validations to `kernel.changes.transition` and `kernel.changes.status`.
   - **SDK Host Dependency**: `@specd/cli` imports contracts and domain errors via `@specd/sdk` instead of reaching directly into `@specd/core` internals.
   - **No Business Logic in CLI**: Transition routing tables, approval gate logic, check evaluation, and implementation tracking are handled entirely by Core use cases.

2. **[`default:_global/conventions`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/conventions/spec.md)**:
   - **File Naming**: Strict kebab-case naming throughout (`transition.ts`, `_check-progress-presenter.ts`, `_hook-progress-presenter.ts`).
   - **ESM & Named Exports**: Modern ESM with NodeNext module resolution and explicit named exports (`registerChangeTransition`, `createCheckProgressPresenter`).
   - **Type Safety**: TypeScript strict mode adhered to; zero usage of `any`. Explicit type signatures on all exported functions.

3. **[`default:_global/testing`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/testing/spec.md)**:
   - **Framework**: Vitest runner used for all tests.
   - **Mirroring Structure**: Tests mirror source location at `packages/cli/test/commands/change/transition.spec.ts`.
   - **No Snapshot Tests**: Zero snapshots (`toMatchSnapshot` or `toMatchInlineSnapshot`); all assertions use explicit BDD matchers.
   - **Speed & Isolation**: Deterministic in-memory unit tests executing 47 tests in 46ms.

4. **[`default:_global/error-handling-conventions`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/_global/error-handling-conventions/spec.md)**:
   - **Typed Error Hierarchy**: Handles `SpecdError` subclasses (`CheckPredicateFailedError`, `CheckNotSkippableError`, `UnknownCheckError`, `InvalidStateTransitionError`, `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`).
   - **Actionable Messaging**: CLI Text Repair Guide provides clear remediation steps, displaying `check:`, `command:`, and conditional `bypass:` syntax.
   - **Consistent Exit Codes**: Exits code 1 on lifecycle and check failures; exits code 2 on hook failures.

---

## Conclusion

The CLI transition implementation in `@specd/cli` for the `custom-checks-and-resilient-hooks` change strictly and exhaustively satisfies all requirements, verification scenarios, and formatting constraints for `cli:change-transition`:

- `--skip-checks` flag with comma-separated IDs, deduplication, and legacy alias translation (`--allow-out-of-scope`, `--allow-overlap`): 100% compliant.
- `--skip-hooks` flag with granular phase selection (`source.pre`, `source.post`, `target.pre`, `target.post`, `all`): 100% compliant.
- Text Repair Guide formatting for `CheckPredicateFailedError` (displaying gerund label, command, and skippable-only bypass line): 100% compliant.
- Check progress bus presentation without `Executing:` prefix and without leaking `hook-progress` JSON stream: 100% compliant.

**Final Verdict**: COMPLIANT (0 Discrepancies, 0 Drift, 0 Missing Tests).

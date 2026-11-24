# Proposal: decouple-core-cli-workflow-guidance

## Motivation

In `decouple-core-cli-error-hints`, `@specd/core` error messages were decoupled from CLI flags and command strings, but non-error workflow guidance and status/blocker projections were explicitly deferred. Today, `@specd/core` still embeds CLI commands, agent slash commands, and CLI `--skip-checks` flags directly inside `NextAction`, `LifecycleNextAction`, `Blocker`, check results, and verification validity details. This couples core domain/application logic to CLI/skill presentation, forces non-CLI hosts (`@specd/mcp`, `@specd/sdk` consumers) to parse or ignore CLI syntax, and leaves `lifecycle-guidance.ts` hardcoding gate and verification rules that belong to the checks themselves.

## Current behaviour

1. **CLI and slash-command strings in `@specd/core` next-action projections:**
   - `packages/core/src/application/services/lifecycle-guidance.ts` (`resolveLifecycleCommand`, `phaseCommand`, `resolveLifecycleNextAction`) returns literal CLI commands (`'specd changes approve spec'`, `'specd changes approve signoff'`, `'specd change archive'`) and slash commands (`'/specd-design'`, `'/specd-verify'`, `'/specd-implement'`, `'/specd-archive'`) in `LifecycleNextAction.command`.
   - The same file hardcodes check knowledge: `boundFromStates('approval.spec' | 'approval.signoff')`, `change.activeSpecApproval` / `activeSignoff` inspection, `validity.specApproval === 'stale' | 'revoked'`, `validity.verification` states, and string matching on `nextHop.reason === 'Renew verification in place'`.
   - `packages/core/src/application/use-cases/get-status.ts` (`NextAction.command`, `_nextActionAfterArchiveOverlap` returning `command: '/specd-archive'`), `edit-change.ts` (`editNextAction`), and `invalidate-verification.ts` (`nextFrom`) emit literal slash commands on `NextAction`.
   - `reconcile-change-validity.ts`, `change-validity.ts`, and `domain/checks/verification-current.ts` emit `details: { command: 'specd changes verification start <name>' }` and `{ command: 'specd changes status <name>' }`. `transition-checks.ts` defines `CheckResult.command?`, `Check.command?`, and `CustomCheckDefinition.command?` as CLI remediation strings, and `CheckPredicateFailedError` carries `command`.
2. **CLI `--skip-checks` flag coupled into `@specd/core` blockers and status prose:**
   - `lifecycle-verdict.ts` (`blockersFromFailedChecks`) emits `bypassFlag: '--skip-checks ${check.id}'` on `LifecycleBlocker`; `isBypassFlagActive` and the verdict option `bypassFlags` parse `--` and `--skip-checks ` prefixes.
   - `get-status.ts` projects `bypassFlag` onto `Blocker` and appends `Use ${bypass} to archive anyway.` to `nextAction.reason` in `_nextActionAfterArchiveOverlap`.
3. **Direct CLI consumption of core presentation strings:** `packages/cli/src/commands/change/status.ts`, `transition.ts`, `invalidate.ts`, `edit.ts`, `approve.ts`, `verification.ts`, and `_validity-present.ts` consume `command` and `bypassFlag` directly from core.
4. **Existing specs encode the coupling:** `core:lifecycle-engine`, `core:get-status`, `core:transition-checks` (`Projections`), `core:transition-change` (`CheckPredicateFailedError.command`, committed-recovery recommendation), and `core:invalidate-change` (`nextAction` command) mandate literal commands and `bypassFlag`. No global spec states that non-error core projections must be host-neutral (`default:_global/error-handling-conventions` only covers errors).

## Proposed solution

Apply the host-neutral core + delivery-presenter pattern to non-error workflow guidance and bypass projections, and make checks self-sufficient owners of their remediation:

1. **Check-declared, typed, host-neutral `CheckAction` on `CheckResult` only:**
   - Replace `CheckResult.command`, `Check.command`, `CustomCheckDefinition.command`, and `CheckPredicateFailedError.command` with `CheckResult.action?: CheckAction` (`kind`, optional `params`, optional host-neutral `guidance`, optional `supersedesIntent`). `action` lives **only** on `CheckResult` (built by the check at failure time from `CheckExecutionContext`); it is removed from the `Check` and `CustomCheckDefinition` interfaces so there is no static/dynamic merge.
   - Built-in kinds are typed (exported constants and factory helpers with typed `params`): `approve-spec`, `approve-signoff`, `start-verification` (`changeName`), `refresh-status` (`changeName`). Plugin kinds are open strings namespaced `@${pluginName}.${id}` (same convention as plugin check ids).
   - `approval.spec` emits `approve-spec` on both `APPROVAL_STALE` and `APPROVAL_REQUIRED` (stale consent is a committed recovery to `designing`; there is no `redesign-spec` kind); `approval.signoff` emits `approve-signoff` for both; `verification.current` emits `start-verification` / `refresh-status`.
2. **Self-sufficient guidance (no check knowledge in `lifecycle-guidance.ts`):**
   - `LifecycleActionIntent` is strictly workflow phases (`design | implement | verify | archive`). `LifecycleNextAction` / `NextAction` carry `intent` plus optional `action`.
   - Deterministic precedence: only the failed predicates of the hop the recommendation waits on (the `nextHop` target, or the first failing forward candidate when `nextHop` holds in place) are considered, in resolved-binding order; the first failure declaring an `action` becomes `nextAction.action`. If that action does not declare `supersedesIntent: false` (default `true`, used by gates and `redesign-spec`), `nextAction.intent` is `null`; verification actions set `supersedesIntent: false`, so `intent` keeps the phase value (`verify`) and the action stays informational on the blocker and the repair guide.
   - Remove all `boundFromStates('approval.*')`, `activeSpecApproval` / `activeSignoff`, `validity.specApproval`, and `'Renew verification in place'` string matching from guidance. Stale/revoked spec approval is expressed by committed recovery (`intent: 'design'`) and, once the change is back in `ready`, by `approval.spec` (`approve-spec`); the domain `nextHop` does not read `validity.specApproval` or `validity.signoff`.
   - `change-validity.ts` and `reconcile-change-validity.ts` verification blockers carry `action: CheckAction` (`start-verification` with `changeName`) instead of `details.command`.
3. **Structured bypass in `@specd/core`:** remove `bypassFlag` from `LifecycleBlocker` / `Blocker`; rely on `isSkippable` + `checkId`. Rename the verdict option `bypassFlags` → `skippedCheckIds` and delete all `--skip-checks` prefix parsing from core. `_nextActionAfterArchiveOverlap` returns `intent: 'archive'` with `reason: overlap.message`.
4. **Committed-recovery and invalidation guidance from real checks:** `committedRecoveryError` (`transition-change.ts`) and `invalidationNextAction` (`invalidate-change.ts`) evaluate the forward checks of the recovered state through the `CheckRegistry` instead of passing `checksByTarget: {}`, so actions always come from checks.
5. **Delivery-layer projection in `@specd/cli`:** a centralized `guidance-presenter.ts` (parallel to `error-hints.ts`) maps intents and check actions to CLI/slash commands and `--skip-checks <checkId>`. CLI JSON/TOON DTOs keep `command` and `bypassFlag` (computed at the CLI boundary) and **additionally** expose `intent` and `action` for non-draft results; `draftView` output keeps `command: null` and exposes neither.
6. **Check-gated legacy parking states and the hardcoding it makes redundant:**
   - `approval.spec` and `approval.signoff` also bind from the legacy parking states (`pending-spec-approval`, `spec-approved`; `pending-signoff`, `signed-off`), so a historic change cannot leave them without consent and guidance needs no drain branch.
   - `pending-spec-approval` now exits to `implementing | designing` and `pending-signoff` to `archivable | designing | done` (forward exit first); neither leads into `spec-approved` / `signed-off`, which keep their exits but have no entry edge. `HAPPY_PATH_NEXT` and `nextWorkflowStep` cover the parking states.
   - Remove the hardcoding this replaces: the approval "stay in place" branch and the per-state drain branches of the domain `nextHop`, the target-name `INVALID_TRANSITION` messages, `TransitionChange._assertDrainAndGateTargets`, the implicit transitions in `ApproveSpec` / `ApproveSignoff` (eligible states come from `boundFromStates`), and the duplicated verification-boundary state lists in `reconcile-change-validity.ts` and `invalidate-verification.ts` (both use `isAtOrAfterVerificationBoundary`).
7. **Checks own their failure reporting:** every failed predicate in `TransitionChange` and `ArchiveChange` (including `protocol.edge`) is thrown as one `CheckPredicateFailedError`, now with optional `from` / `to`; use cases stop switching on check ids. Each check emits its full payload in `details` (per-code contract in `core:transition-checks`: `blockedBy`, task counts, every dependency mismatch, overlap entries, readOnly specs, open files). The CLI renders by `checkId` / `code` (context from `details`, command from `action`, hints by check id). `SpecOverlapError` and `ArchiveDependencyMismatchError` are deleted, and `InvalidStateTransitionError` keeps `invalid-transition` plus `incomplete-artifact` (still used by the approve use cases for their eligibility failure); the `approval-required`, `gate-not-required`, `incomplete-tasks`, `missing-task-capability` reasons go. `ReadOnlyWorkspaceError`, `SchemaProviderIdentityMismatchError`, and `ArchiveImplementationStateError` stay for their non-check users.
8. **Documentation:** update the guide and reference pages that describe the changed behavior (workflow states and transitions, error reasons, custom-check ABI, CLI output); ADRs stay as historical records.
9. **Global rule:** add a requirement to `default:_global/error-handling-conventions` stating that non-error core projections (next actions, blockers, check results, validity details) are host-neutral and delivery hosts project commands/flags.

## Specs affected

### New specs

- None.

### Modified specs

- `skills:skill-templates-source`: `specd-implement` accepts `pending-spec-approval` next to `spec-approved` after consent; `specd-new` rows for parked states follow `nextAction`.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-approve`: approving from a legacy parking state records consent and prints no transition.
  - Depends on (added): none
  - Depends on (removed): none

- `core:archive-change`: archive predicate failures (`spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.*`, `verification.current`, plugin checks) are `CheckPredicateFailedError` with check-owned `details`; `SpecOverlapError` and `ArchiveDependencyMismatchError` retired.
  - Depends on (added): none
  - Depends on (removed): none
- `core:workflow-model`: requires and task-completion failures are check failures (`CheckPredicateFailedError`).
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-archive`: archive failures rendered from `CheckPredicateFailedError` by check id.
  - Depends on (added): none
  - Depends on (removed): none

- `core:change`: `VALID_TRANSITIONS` exits for the legacy parking states (delivery edges, no entry into another legacy state).
  - Depends on (added): none
  - Depends on (removed): none
- `core:workflow-topology`: drain exits come only from the transition table; one `nextWorkflowStep` rule for all drain states.
  - Depends on (added): none
  - Depends on (removed): none
- `core:approve-spec` / `core:approve-signoff`: eligible states read from the check bindings; consent never transitions the change.
  - Depends on (added): none
  - Depends on (removed): none

- `core:transition-checks`: `CheckResult.action` host-neutral `CheckAction` contract (typed built-in kinds, namespaced plugin kinds, `action` only on `CheckResult`), gate/verification actions, `Projections` requirement rewritten to intents/actions and structured bypass, resolved-binding blocker projection without `bypassFlag`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:lifecycle-engine`: host-neutral `LifecycleNextAction` (`intent` + `action`), deterministic nextHop-scoped action precedence, in-place intent rule, no check knowledge in guidance, `LifecycleBlocker` without `bypassFlag` and with `action`, `skippedCheckIds` verdict input, verification-validity blockers carrying `action`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: `NextAction.intent` / `action`, `Blocker.action` without `bypassFlag`, host-neutral overlap `reason`, `evaluateLifecycle` requirement text updated.
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-change`: `CheckPredicateFailedError` carries `action` instead of `command`; committed-recovery reporting derives guidance from checks of the recovered state.
  - Depends on (added): none
  - Depends on (removed): none
- `core:invalidate-change`: next action is host-neutral `intent` / `action` derived from forward checks of the recovered state.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-status`: render CLI commands, slash commands, `--skip-checks` hints, and additive `intent` / `action` fields via the guidance presenter.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-transition`: render bypass hints and repair commands from structured intents/actions/bypass capability.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-invalidate`: render `nextAction.command` from `intent` / `action` via the presenter.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-verification`: render the canonical next-action / remediation command from `action` (`start-verification`, `refresh-status`) with the real change name.
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/error-handling-conventions`: global requirement that non-error core projections are host-neutral and presenters live in delivery hosts.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`@specd/core`:**
  - `application/services/lifecycle-guidance.ts` (`resolveLifecycleCommand` → `resolveLifecycleIntent`, `phaseCommand`, `resolveLifecycleNextAction`), `lifecycle-evaluation.ts`
  - `application/errors/reconciled-operation-blocked-error.ts`
  - `application/use-cases/get-status.ts` (`Blocker`, `NextAction`, `_nextActionAfterArchiveOverlap`, `_mergeBlockers`), `transition-change.ts` (`committedRecoveryError`, `CheckPredicateFailedError` call sites), `archive-change.ts` (`archiveRecoveryError`, `CheckPredicateFailedError` call site), `reconcile-change-validity.ts`, `edit-change.ts` (`editNextAction`), `invalidate-change.ts` (`invalidationNextAction`, `CheckRegistry` wiring), `invalidate-verification.ts` (`nextFrom`)
  - `domain/services/transition-checks.ts` (`CheckResult`, `Check`, `CustomCheckDefinition`, `fail`, `CheckAction`), `check-registry.ts` (`registerCustomCheck`), `lifecycle-verdict.ts` (`LifecycleBlocker`, `isBypassFlagActive`, `bypassFlags` → `skippedCheckIds`, `dedupeBlockers`, `blockersFromFailedChecks`), `change-validity.ts`
  - `domain/checks/approval-spec.ts`, `approval-signoff.ts`, `verification-current.ts`
  - `domain/errors/check-predicate-failed-error.ts`
  - `check-bindings.ts` (approval applicability rows for the legacy parking states), `domain/value-objects/change-state.ts` (`VALID_TRANSITIONS`, `HAPPY_PATH_NEXT`), `workflow-topology.ts` (`nextWorkflowStep`), `happy-path-next-unavailable-error.ts`, `approve-spec.ts`, `approve-signoff.ts`, `invalidate-verification.ts` / `reconcile-change-validity.ts` (boundary helper), `lifecycle-verdict.ts` (`resolveLifecycleNextHop` and requested-target blockers), `transition-change.ts` (`_assertDrainAndGateTargets` and `_mapFailedPredicate` removed), `archive-change.ts` (`throwMappedArchiveFailure` switch removed), `domain/checks/*` (own `details`), `check-predicate-failed-error.ts` (`from` / `to`), `invalid-state-transition-error.ts` (reasons trimmed), deletion of `spec-overlap-error.ts` and `archive-dependency-mismatch-error.ts`.
- **`@specd/cli`:**
  - New `guidance-presenter.ts`; `commands/change/status.ts`, `transition.ts`, `invalidate.ts`, `edit.ts`, `approve.ts`, `verification.ts`, `_validity-present.ts`
- **`@specd/sdk`:** `core-reexports.ts` (`CheckAction`, built-in action helpers, `LifecycleActionIntent`, updated `NextAction`, `Blocker`, `LifecycleNextAction`, `LifecycleBlocker`).
- **Graph impact:** `NextAction` has 20 affected declarations; `CheckResult` has 71 direct logical targets (103 total); `resolveLifecycleCommand` has 11 direct logical targets.
- **Concurrent changes:** `core:transition-checks` is also targeted by `change-context-notes` (ready) and `merged-spec-validity-gate` (drafting); `core:transition-change`, `core:get-status`, `core:lifecycle-engine`, `cli:change-status`, and `cli:change-transition` are also targeted by `change-context-notes` (ready); `core:archive-change` is also targeted by `change-context-notes` (ready) and `merged-spec-validity-gate` (drafting); `skills:skill-templates-source` by `change-context-notes` (ready); `core:change` is also targeted by `change-context-notes` (ready), `change-schema-fallback-cache` (drafting), and `implementation-snapshot` (designing). Archive order must be coordinated and deltas re-previewed after whichever change archives first.

## Technical context

- Follows the host-neutral core + centralized CLI presenter pattern established in `decouple-core-cli-error-hints`, adapted for non-error read/projection models.
- Agreed decisions: one explicit action `kind` per distinct action (never `approve` + `gate`); `approval.spec` emits `approve-spec` for both stale and missing consent; action precedence is scoped to the selected `nextHop`, first by binding order; verification renewal keeps `intent: 'verify'` with `start-verification` (`supersedesIntent: false`) as informational blocker/repair action; `action` only on `CheckResult`; legacy parking states are gated by check bindings and exit through the delivery edges.
- Rejected: parameterized `approve` kind; hardcoding gate rules in `lifecycle-guidance.ts`; keeping static `Check.action`; keeping `--skip-checks` parsing in core for legacy callers; `details.remediation` string for validity blockers.
- Presenter resolution order for `nextAction`: `intent` mapping when `intent !== null`, otherwise `action` mapping; unknown plugin kinds fall back to `action.guidance ?? null` and never invent CLI syntax.
- CLI structured outputs keep `command` / `bypassFlag` for backward compatibility with skills, and add `intent` / `action` additively.
- **Assumption:** a change in a legacy parking state runs under a legacy schema where every step is enabled, so the parking-state exits need no handling of disabled steps.
- **Follow-up (out of scope):** remove the four legacy states (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`) and the scaffolding that only exists for them: `DRAIN_STATES`, `DRAIN_OFFSETS`, `deliveryState`, `DELIVERY_AXIS`, the drain lists in `build-schema.ts` / `schema-yaml-parser.ts` / `manifest.ts`, `SKILL_HOP_SOURCES`, plus a manifest migration.
- **Breaking changes:** callers that catch `SpecOverlapError`, `ArchiveDependencyMismatchError`, or the removed `InvalidStateTransitionError` reasons must catch `CheckPredicateFailedError` and switch on `checkId`; `e.code` values change. Document in the changelog.

## Open questions

None.

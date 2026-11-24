# Tasks: decouple-core-cli-workflow-guidance

## 1. CheckAction ABI (core domain)

- [x] 1.1 Add `CheckAction`, `BuiltInCheckActionKind` to transition-checks
      `packages/core/src/domain/services/transition-checks.ts`: `CheckAction` — new exported interface (`kind`, `params?`, `guidance?`, `supersedesIntent?`)
      Approach: `kind: BuiltInCheckActionKind | string`; built-in kinds `approve-spec | approve-signoff | start-verification | refresh-status`; plugin kinds namespaced `@plugin.id`; JSDoc per `_global/docs`.
      (Req: Check-declared host-neutral actions)
- [x] 1.2 Add typed action factories
      `transition-checks.ts`: `approveSpecAction`, `approveSignoffAction`, `startVerificationAction`, `refreshStatusAction`
      Approach: verification factories return `{ kind, params: { changeName }, supersedesIntent: false }`; gate factories return `{ kind }` only.
      (Req: Check-declared host-neutral actions)
- [x] 1.3 Replace `command` with `action` on `CheckResult` and `fail`
      `transition-checks.ts`: `CheckResult`, `fail(...)` — `command?: string` → `action?: CheckAction`
      Approach: `fail(id, code, message, details?, action?)`; update every existing `fail` caller that passed `command`.
      (Req: Check identity and result)
- [x] 1.4 Remove `command` from `Check` and `CustomCheckDefinition`; add no `action`
      `transition-checks.ts`: `Check`, `CustomCheckDefinition`
      Approach: delete the property; remediation can only be returned on `CheckResult`.
      (Req: Check ABI create and WorkflowCheck; Public CustomCheckDefinition contract)
- [x] 1.5 Stop copying `command` in custom check registration
      `packages/core/src/domain/services/check-registry.ts`: `registerCustomCheck` — remove `command` copy
      Approach: nothing replaces it; results carry actions.
      (Req: Public CustomCheckDefinition contract)
- [x] 1.6 Export the ABI
      `packages/core/src/domain/services/index.ts`, `packages/core/src/public.ts` — export `CheckAction`, `BuiltInCheckActionKind`, factories
      Approach: add to the existing curated exports.
      (Req: Check-declared host-neutral actions)

## 2. Built-in checks emit actions

- [x] 2.1 `approval.spec` emits `approve-spec` (stale and missing; see 14.1)
      `packages/core/src/domain/checks/approval-spec.ts`: `run`
      Approach: `APPROVAL_STALE` and `APPROVAL_REQUIRED` → `fail(..., approveSpecAction())` (no `redesign-spec` kind; see 14.1).
      (Req: Check-declared host-neutral actions)
- [x] 2.2 `approval.signoff` emits `approve-signoff`
      `packages/core/src/domain/checks/approval-signoff.ts`: `run`
      Approach: both `APPROVAL_REQUIRED` and `APPROVAL_STALE` pass `approveSignoffAction()`.
      (Req: Check-declared host-neutral actions)
- [x] 2.3 `verification.current` emits verification actions
      `packages/core/src/domain/checks/verification-current.ts`: remove `details.command` (about lines 33, 42)
      Approach: `VERIFICATION_VALIDITY_UNAVAILABLE` → `refreshStatusAction(facts.name)`; `VERIFICATION_REQUIRED/IN_PROGRESS/STALE` → `startVerificationAction(facts.name)`.
      (Req: Check-declared host-neutral actions)
- [x] 2.4 Confirm `check-bindings.ts` is unchanged
      `packages/core/src/domain/services/check-bindings.ts`
      Approach: no edit; add a regression test that `approval.spec` applies from `ready` and `approval.signoff` from `done` only.
      (Req: Check-declared host-neutral actions)
- [x] 2.5 Validity blockers carry actions
      `packages/core/src/domain/services/change-validity.ts` (`verificationBlockers`, about line 544); `packages/core/src/application/use-cases/reconcile-change-validity.ts` (about line 487)
      Approach: replace `details: { command }` with `action: startVerificationAction(name)` on `VERIFICATION_STALE` blockers.
      (Req: Machine-readable blockers)

## 3. Lifecycle verdict (domain)

- [x] 3.1 `LifecycleBlocker`: drop `bypassFlag`, add `action`
      `packages/core/src/domain/services/lifecycle-verdict.ts`: `LifecycleBlocker`, `blockersFromFailedChecks`
      Approach: copy `check.action` onto the blocker; stop emitting `--skip-checks ${check.id}`.
      (Req: Machine-readable blockers)
- [x] 3.2 Rename `bypassFlags` → `skippedCheckIds` and delete flag parsing
      `lifecycle-verdict.ts`: verdict input option, local set, helper params (about lines 74, 186, 310, 315, 360, 637, 642, 958, 974), `isBypassFlagActive`
      Approach: replace `isBypassFlagActive` with a plain `skipped.has(checkId)`; no `--` / `--skip-checks ` stripping; update all callers and `LifecycleVerdictInput` type; search other packages for the old option name.
      (Req: Stateless domain lifecycle verdict; Machine-readable blockers)
- [x] 3.3 `dedupeBlockers` key
      `lifecycle-verdict.ts`: `dedupeBlockers`
      Approach: key on `code`, `checkId ?? null`, `isSkippable`.
      (Req: Machine-readable blockers)

## 4. Lifecycle guidance (application)

- [x] 4.1 Define `LifecycleActionIntent` and new `LifecycleNextAction`
      `packages/core/src/application/services/lifecycle-guidance.ts`
      Approach: `type LifecycleActionIntent = 'design' | 'implement' | 'verify' | 'archive'`; `LifecycleNextAction extends LifecycleNextHop { intent; action? }`.
      (Req: Application lifecycle guidance)
- [x] 4.2 Replace `resolveLifecycleCommand` with `resolveLifecycleIntent`
      `lifecycle-guidance.ts`: `resolveLifecycleCommand`, `phaseCommand`, `resolveLifecycleNextAction`
      Approach: signature `(change, nextHop, review, availableTransitions, approvals, schema, validity, hopFailures)`; remove every CLI/slash string; remove `boundFromStates`, `activeSpecApproval`, `activeSignoff`, `validity.specApproval`, `validity.signoff`, the `'Renew verification in place'` match, and every legacy parking-state branch (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`; their gate is now a bound check); keep topology logic (`isWorkflowStepEnabled`, `isAtOrAfterVerificationBoundary`, `resolveWorkflowPipeline`).
      (Req: Application lifecycle guidance)
- [x] 4.3 Implement action precedence
      `lifecycle-guidance.ts`: `resolveLifecycleIntent`
      Approach: `const first = hopFailures.find(r => r.action !== undefined)`; if found, `action = first.action` and `intent = first.action.supersedesIntent === false ? phaseIntent : null`; else `intent = phaseIntent`. In-place verification renewal still yields `'verify'` from topology + validity.
      (Req: Application lifecycle guidance)
- [x] 4.4 Derive `hopFailures` in `evaluateLifecycle`
      `packages/core/src/application/services/lifecycle-evaluation.ts`: `evaluateLifecycle`
      Approach: if `nextHop.targetStep !== change.state` use failed predicate results of `checksByTarget[nextHop.targetStep]`; otherwise the failed predicate results of the first forward candidate that has failures, where candidates are the `validTransitions` entries forward of the current state by the verdict's `isForward` (drain states sit next to their anchor), ordered by target pipeline position; keep evaluator order; pass to `resolveLifecycleIntent`.
      (Req: Application lifecycle guidance)

## 5. Use cases (core application)

- [x] 5.1 `NextAction`/`Blocker` types in `GetStatus`
      `packages/core/src/application/use-cases/get-status.ts`: `NextAction`, `Blocker`, `_mergeBlockers`
      Approach: `NextAction { targetStep, actionType, reason, intent, action? }`; `Blocker` without `bypassFlag`, with `action?`; `_mergeBlockers` propagates `isSkippable`, `checkId`, `action` from review blockers and candidates.
      (Req: Identifies blockers; Returns the change and its artifact statuses)
- [x] 5.2 Failing-check fallback and drafted status
      `get-status.ts`: fallback (about lines 742–758), drafted/`unchanged` branches
      Approach: use `failingCheckWithAction.action` when `intent === null && action === undefined`; drafted/unchanged → `intent: null`, no action.
      (Req: Drafted change read-only status; Identifies blockers)
- [x] 5.3 Overlap next action
      `get-status.ts`: `_nextActionAfterArchiveOverlap`
      Approach: return `intent: 'archive'`, `reason: overlap.message`; remove the `Use ${bypass} to archive anyway.` prose and `bypassFlag`.
      (Req: Identifies blockers)
- [x] 5.4 `EditChange`, `InvalidateVerification`, `ArchiveChange` intents
      `edit-change.ts` (`editNextAction`), `invalidate-verification.ts` (`nextFrom`), `archive-change.ts` (`archiveRecoveryError`)
      Approach: return `intent: 'design' | 'verify' | null`; remove `/specd-*` strings.
      (Req: Application lifecycle guidance)
- [x] 5.5 `CheckPredicateFailedError.action`
      `packages/core/src/domain/errors/check-predicate-failed-error.ts`; call sites `transition-change.ts` (about lines 566, 574, 653) and `archive-change.ts` (about line 1592)
      Approach: `command?: string` → `action?: CheckAction`; pass `action: result.action` at each call site.
      (Req: Shared runner errors propagate on transition)
- [x] 5.6 Committed-recovery guidance from checks
      `packages/core/src/application/use-cases/transition-change.ts`: `committedRecoveryError` (about line 744)
      Approach: evaluate forward checks of the recovered state with the shared candidate evaluator / `CheckRegistry` and pass real `checksByTarget` to `evaluateLifecycle` instead of `{}`.
      (Req: Canonical pre-transition validity reconciliation)
- [x] 5.7 `InvalidateChange` next action from checks
      `packages/core/src/application/use-cases/invalidate-change.ts`: `invalidationNextAction` (about line 223), constructor deps, `resolveInvalidateChangeDeps`, kernel wiring
      Approach: add the `CheckRegistry` (and any evaluator input) to deps, evaluate forward checks of the recovered state, remove `checksByTarget: {}`.
      (Req: Next action follows lifecycle guidance)
- [x] 5.8 `ReconciledOperationBlockedError` message
      `packages/core/src/application/errors/reconciled-operation-blocked-error.ts` (about line 48)
      Approach: format `nextAction.intent` / `nextAction.action?.kind` as host-neutral tokens; no `command`.
      (Req: Host-Neutral Core Projections)
- [x] 5.9 Public exports and SDK re-exports
      `packages/core/src/public.ts`, `packages/sdk/src/core-reexports.ts`
      Approach: export/re-export `LifecycleActionIntent`, updated `NextAction`, `Blocker`, `LifecycleNextAction`, `LifecycleBlocker`, `CheckResult`, `CheckAction`, factories.
      (Req: Check-declared host-neutral actions)

## 6. CLI presenter

- [x] 6.1 Create the presenter module
      `packages/cli/src/guidance-presenter.ts`: `resolveCliWorkflowCommand`, `resolveCliBypassFlag`, `projectCliNextAction`, `CliProjectedNextAction`
      Approach: intent first (`design/implement/verify/archive` → `/specd-*`), else action (`approve-spec` → `specd changes approve spec`, `approve-signoff` → `specd changes approve signoff`, `start-verification` → `specd changes verification start ${changeName}`, `refresh-status` → `specd changes status ${changeName}`); unknown kind or missing `changeName` → `action.guidance ?? null`; overlap suffix ` Use --skip-checks <checkId> to archive anyway.` only for a skippable `OVERLAP_CONFLICT` when `intent === 'archive'`.
      (Req: Archive bypass hints come from resolved bindings; Host-Neutral Core Projections)
- [x] 6.2 `status.ts`
      `packages/cli/src/commands/change/status.ts`
      Approach: `bypass:` line and `bypassFlag` from `resolveCliBypassFlag`; `nextAction.command`/`reason` from `projectCliNextAction`; JSON/TOON add `nextAction.intent`, `nextAction.action`, `blocker.action` for active changes; `draftView` → `command: null`, no `intent`/`action`.
      (Req: Archive bypass hints come from resolved bindings)
- [x] 6.3 `transition.ts`
      `packages/cli/src/commands/change/transition.ts`: `renderTransitionRepairGuide` and JSON/TOON failure output
      Approach: read `cpErr.action`, resolve via `resolveCliWorkflowCommand(null, action)`; project `command`/`bypassFlag` through the presenter; add `intent`/`action` additively.
      (Req: Validity-aware transition guidance)
- [x] 6.4 `invalidate.ts`, `edit.ts`, `approve.ts`
      `packages/cli/src/commands/change/invalidate.ts`, `edit.ts` (`appendEditGuidance`), `approve.ts` (`enrichApprovalFailure`)
      Approach: `projectCliNextAction(nextAction)` in text, JSON, TOON, stderr paths.
      (Req: Reporting; Success and idempotent output)
- [x] 6.5 `verification.ts` and `_validity-present.ts`
      `packages/cli/src/commands/change/verification.ts`, `_validity-present.ts`: `PublicNextAction`, `projectNextAction`
      Approach: `command` from presenter; verification blocker actions resolved with the real `changeName`; JSON/TOON keep `command` and add `intent`/`action`.
      (Req: Success and idempotent output)

## 7. Core tests

- [x] 7.1 Check tests
      `packages/core/test/domain/checks/approval-spec.spec.ts`, `approval-signoff.spec.ts`, `verification-current.spec.ts`
      Approach: assert the exact `action` objects (including `supersedesIntent: false`) and that no CLI strings appear in `action`, `message`, `details`.
      (Req: Check-declared host-neutral actions)
- [x] 7.2 ABI tests
      `packages/core/test/domain/services/transition-checks.spec.ts`, check-registry tests, check-bindings tests
      Approach: `Check`/`CustomCheckDefinition` have no `action`/`command`; plugin namespaced kind preserved on `CheckResult`; approval bindings cover `ready`, `pending-spec-approval`, `spec-approved` and `done`, `pending-signoff`, `signed-off` (see group 10).
      (Req: Check-declared host-neutral actions; Check identity and result)
- [x] 7.3 Verdict tests
      `packages/core/test/domain/services/lifecycle-verdict.spec.ts`
      Approach: blockers omit `bypassFlag`, propagate `action`, are removed by `skippedCheckIds`, and a flag-shaped id like `--skip-checks spec.overlap` does not skip.
      (Req: Machine-readable blockers)
- [x] 7.4 Validity tests
      `packages/core/test/domain/services/change-validity.spec.ts`, `reconcile-change-validity.spec.ts`
      Approach: blockers carry `start-verification` with `changeName`, no `details.command`.
      (Req: Machine-readable blockers)
- [x] 7.5 Guidance tests
      `packages/core/test/application/services/lifecycle-guidance.spec.ts`, `lifecycle-evaluation.spec.ts`
      Approach: cover every phase intent; first-failed-action precedence; other hops ignored; `supersedesIntent: false` keeps `'verify'`; stale approval in `designing` / `ready` (see 14.2); verifying disabled never `'verify'`; legacy parking states resolve from the bound approval check action; assert `lifecycle-guidance.ts` source has no `approval.`, `boundFromStates`, `/specd-`, `specd changes`.
      (Req: Application lifecycle guidance)
- [x] 7.6 Use-case tests
      `packages/core/test/application/use-cases/get-status.spec.ts`, `transition-change.spec.ts`, `invalidate-change.spec.ts`, `edit-change`, `invalidate-verification`, `archive-change`
      Approach: assert `intent`, `action`, `isSkippable`, `checkId`; `CheckPredicateFailedError.action`; committed recovery and invalidation actions come from evaluated forward checks; remove all assertions on `nextAction.command` and `bypassFlag`.
      (Req: Identifies blockers; Shared runner errors propagate on transition; Next action follows lifecycle guidance)

## 8. CLI tests

- [x] 8.1 Presenter unit tests
      `packages/cli/test/guidance-presenter.spec.ts` (new)
      Approach: all intents/kinds, intent-wins-over-informational-action, unknown kind → guidance, missing `changeName` → guidance, bypass flag only for `isSkippable && checkId`, overlap suffix conditions.
      (Req: Archive bypass hints come from resolved bindings; Host-Neutral Core Projections)
- [x] 8.2 Command tests
      `packages/cli/test/commands/change/status.spec.ts`, `transition.spec.ts`, `change-invalidate.spec.ts`, verification command tests, edit/approve tests
      Approach: text/JSON/TOON render commands and `--skip-checks <checkId>`, additive `intent`/`action`, drafted output has no `intent`/`action`, real change name in verification commands.
      (Req: Archive bypass hints come from resolved bindings; Validity-aware transition guidance; Reporting; Success and idempotent output)
- [x] 8.3 SDK re-export test
      `packages/sdk/test` re-export surface
      Approach: assert `CheckAction`, factories, `LifecycleActionIntent` are re-exported.
      (Req: Check-declared host-neutral actions)

## 9. Documentation and verification

- [x] 9.1 Update docs
      see group 12 for the exact files and sections
      Approach: replace references to `NextAction.command`, `Blocker.bypassFlag`, `CheckResult.command`, `CustomCheckDefinition.command`; document the `CheckAction` ABI (namespaced kinds, `supersedesIntent`, `guidance` fallback) and the `skippedCheckIds` rename; add a changelog/migration note for breaking `@specd/core` type changes.
      (Req: Host-Neutral Core Projections)
- [x] 9.2 Build and run suites
      workspace
      Approach: `pnpm --filter @specd/core test -- --run`, `pnpm --filter @specd/cli test -- --run`, `pnpm --filter @specd/sdk test -- --run`, then `pnpm build`.
      (Req: all)
- [x] 9.3 Manual CLI check
      CLI
      Approach: `node packages/cli/dist/index.js changes status <active-change> --format text` and `--format toon`; verify next action command, `bypass:` lines, and the additive fields.
      (Req: Archive bypass hints come from resolved bindings)
- [x] 9.4 Archive-order coordination
      process
      Approach: before archiving, re-run `specd changes spec-preview` for `core:transition-checks`, `core:transition-change`, `core:get-status`, `core:lifecycle-engine`, `core:change`, `cli:change-status`, `cli:change-transition` after `change-context-notes`, `merged-spec-validity-gate`, `change-schema-fallback-cache`, and `implementation-snapshot` archive; resolve delta conflicts.
      (Req: all)
- [x] 9.5 Record the follow-up
      process
      Approach: open a separate change to remove the four legacy states (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`) and their scaffolding (`DRAIN_STATES`, `DRAIN_OFFSETS`, `deliveryState`, `DELIVERY_AXIS`, schema/manifest drain lists, `SKILL_HOP_SOURCES`) with a manifest migration. Not part of this change.
      (Req: Check-declared host-neutral actions)

## 10. Legacy parking-state gating and redundant hardcoding

- [x] 10.1 Bind the approval checks from the legacy parking states
      `packages/core/src/domain/services/check-bindings.ts`: `approval.spec`, `approval.signoff` applicability
      Approach: `approval.spec` rows `{ scope: 'transition', from, to: '*', along: 'forward' }` for `ready`, `pending-spec-approval`, `spec-approved`; `approval.signoff` rows `{ scope: 'transition', from, to: 'archivable', along: 'forward' }` for `done`, `pending-signoff`, `signed-off`; confirm `boundFromStates` reflects them and `classifyAlong` yields `forward` / `redesign` as expected.
      (Req: Approval bindings cover legacy parking sources)
- [x] 10.2 Update the transition table
      `packages/core/src/domain/value-objects/change-state.ts`: `VALID_TRANSITIONS`, `HAPPY_PATH_NEXT`, doc comment
      Approach: `pending-spec-approval: ['implementing', 'designing']`, `pending-signoff: ['archivable', 'designing', 'done']` (forward exit first); add `pending-spec-approval: 'implementing'` and `pending-signoff: 'archivable'` to `HAPPY_PATH_NEXT`; `spec-approved` / `signed-off` keep their exits and gain no entry edge.
      (Req: Lifecycle; Dynamic legal transitions)
- [x] 10.3 One drain rule in `nextWorkflowStep`
      `packages/core/src/domain/services/workflow-topology.ts`: `nextWorkflowStep`
      Approach: remove the `pending-*` early `null`; for any drain state return the first exit other than `designing` admitted by `listWorkflowTransitions`; keep `DRAIN_STATES`.
      (Req: Topological forward progression)
- [x] 10.4 Domain `nextHop` without approval or drain knowledge
      `packages/core/src/domain/services/lifecycle-verdict.ts`: `resolveLifecycleNextHop`, requested-target blockers (about lines 646–668, 1191–1322)
      Approach: delete the two approval "stay in place" branches; add the `ready` fallback return (`targetStep: 'ready'`, `mechanical`, reason without approval wording); replace the per-state branches of `pending-*`, `spec-approved`, `signed-off` with one drain branch (`nextWorkflowStep` in `availableTransitions` → recommend it, else stay); delete the target-name `INVALID_TRANSITION` special cases.
      (Req: Next hop derives from candidate evaluation)
- [x] 10.5 `ApproveSpec` / `ApproveSignoff` record consent only
      `packages/core/src/application/use-cases/approve-spec.ts` (about lines 97, 109), `approve-signoff.ts` (about lines 113, 159)
      Approach: eligibility via `boundFromStates('approval.spec' | 'approval.signoff')`; delete the implicit `transition('spec-approved' | 'signed-off')`; update class doc comments.
      (Req: Approval recording and state transition; Signoff recording and state transition)
- [x] 10.6 Remove drain special-casing from `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `_assertDrainAndGateTargets` (about lines 470–520) and its call site
      Approach: delete the method and the `gate-not-required` throws; gate failures from parked states use the generic check failure path (group 11).
      (Req: Historic parked approval repair precedence)
- [x] 10.7 Parking states have a happy-path hop
      `packages/core/src/domain/errors/happy-path-next-unavailable-error.ts`
      Approach: delete the `pending-spec-approval` / `pending-signoff` cases.
      (Req: Historic parked approval repair precedence; CLI change-transition `--next`)
- [x] 10.8 One verification-boundary derivation
      `packages/core/src/application/use-cases/reconcile-change-validity.ts` (`VERIFICATION_STATES`, about line 280), `invalidate-verification.ts` (`verificationBoundary`, about line 134)
      Approach: both call `isAtOrAfterVerificationBoundary(state, schema, approvals)`; `reconcile-change-validity.ts` has `this._deps.approvals`; add `ApprovalGates` to `invalidate-verification.ts` deps and kernel wiring if absent.
      (Req: Next hop derives from candidate evaluation)
- [x] 10.9 CLI wording
      `packages/cli/src/commands/change/approve.ts` (command description), `transition.ts`
      Approach: update help text that says `pending-spec-approval` remains a valid source, and make `--next` output work from the parking states without special handling.
      (Req: Next flag from parked states)
- [x] 10.10 Tests for group 10
      `packages/core/test/domain/value-objects/change-state.spec.ts`, `domain/services/workflow-topology.spec.ts`, `domain/services/transition-checks.spec.ts`, `lifecycle-verdict.spec.ts`, `application/use-cases/approve-spec.spec.ts`, `approve-signoff.spec.ts`, `transition-change.spec.ts`, `reconcile-change-validity.spec.ts`, `invalidate-verification.spec.ts`; `packages/cli/test/commands/change/transition.spec.ts`, `approve.spec.ts`
      Approach: one test per verify scenario added in `core:change`, `core:workflow-topology`, `core:approve-spec`, `core:approve-signoff`, `core:transition-checks`, `core:transition-change`, `core:lifecycle-engine`, `cli:change-transition`; remove tests that assert `pending-* → spec-approved/signed-off`, the implicit transition on approval, and the `gate-not-required` rejection.
      (Req: all new group-10 scenarios)

## 11. Checks own their failure reporting

- [x] 11.1 `CheckPredicateFailedError` carries the attempted hop
      `packages/core/src/domain/errors/check-predicate-failed-error.ts`
      Approach: add optional `from` / `to` (`ChangeState`) via a trailing options argument; keep `action`, `details`, `skippable`; update TSDoc.
      (Req: Shared runner errors propagate on transition; Typed errors for archive failures)
- [x] 11.2 Checks emit their full payload
      `packages/core/src/domain/checks/*.ts` and the application `create*` wrappers
      Approach: first extract `findBlockingParent` from `lifecycle-verdict.ts` into a pure module of its own and re-export it there (the checks cannot import `lifecycle-verdict.ts` without an import cycle through `check-bindings.ts`); then, per the contract in `core:transition-checks` ("Check failures carry their own structured details"): `protocol.edge` `{ from, to }`; `workflow.requires` `{ artifactId, status?, blockedBy? }` with `blockedBy` computed by the check (move `findBlockingParent` out of `transition-change.ts`); `workflow.taskCompletion` counts or `reason`; `impl.filesResolved` `files`; `deps.consistent` every mismatch; `spec.overlap` `entries`; `workspace.readOnly` `specs` plus the multi-line message; `schema.nameMatch` names. Move the facts the use cases compute today (`overlapEntries`, `workspaceMap`) into the check facts.
      (Req: Check failures carry their own structured details)
- [x] 11.3 One throw path in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `_mapFailedPredicate`, the two `CheckPredicateFailedError` throw sites
      Approach: delete the `switch`; build one `CheckPredicateFailedError(id, label, code, message, action, details, skippable, { from, to })`; drop unused imports.
      (Req: Shared runner errors propagate on transition)
- [x] 11.4 One throw path in `ArchiveChange`
      `packages/core/src/application/use-cases/archive-change.ts`: `throwMappedArchiveFailure` and the private merge-time guards (about lines 1283, 1308, 1317)
      Approach: delete the `switch`; one helper builds the generic error; merge-time `deps.consistent` and implementation guards use it; remove unused error imports.
      (Req: Typed errors for archive failures; Archive checks share runners and wrap remaining preflight)
- [x] 11.5 Delete retired errors and trim `InvalidStateTransitionError`
      `domain/errors/spec-overlap-error.ts`, `archive-dependency-mismatch-error.ts`, `invalid-state-transition-error.ts`, `domain/errors/index.ts`, `public.ts`, `packages/sdk/src/core-reexports.ts`
      Approach: delete the two classes and their exports; reduce `TransitionFailureReason` and `buildMessage` to `invalid-transition` and `incomplete-artifact`; delete `approvalRequiredMessage` / `gateNotRequiredMessage`; first grep `packages/mcp` and every package for the deleted symbols; keep the `incomplete-artifact` variant (used by `approve-spec.ts` / `approve-signoff.ts`).
      (Req: Typed errors for archive failures; Shared runner errors propagate on transition)
- [x] 11.6 CLI renders by check id
      `packages/cli/src/guidance-presenter.ts` or `error-hints.ts`, `commands/change/transition.ts` (`isRepairGuideError`, `writeTextRepairGuide`), `commands/change/archive.ts`
      Approach: add `describeCheckFailure(err)` (context lines per `checkId` / `code` from `details`), keep hints by check id (add `deps.consistent`), print `from → to`, remove handling of the deleted classes, handle `spec.overlap` as `CheckPredicateFailedError` (`details.entries`, `skippable`).
      (Req: Invalid transition error; Incomplete tasks error; Unsatisfied requires error; Error cases)
- [x] 11.7 Tests for group 11
      `packages/core/test/domain/checks/*.spec.ts`, `application/use-cases/transition-change.spec.ts`, `archive-change.spec.ts`, `domain/errors/invalid-state-transition-error.spec.ts`, `host-neutral-errors.spec.ts`; `packages/cli/test/commands/change/transition.spec.ts`, `archive.spec.ts`, presenter tests
      Approach: one test per new or modified verify scenario in `core:transition-checks`, `core:transition-change`, `core:archive-change`, `core:workflow-model`, `cli:change-transition`, `cli:change-archive`; rewrite assertions on `InvalidStateTransitionError` reasons, `SpecOverlapError`, and `ArchiveDependencyMismatchError`.
      (Req: all new group-11 scenarios)

## 12. Documentation to update

- [x] 12.1 Workflow guide
      `docs/guide/workflow.md` (about lines 49–51, 85–110, 141–165, 195–205)
      Approach: `pending-spec-approval` now exits to `implementing` or `designing` and `pending-signoff` to `archivable`, `designing`, or `done`; approving there records consent and no longer drains to `spec-approved` / `signed-off`; update the transition tables and the drain-only text; explain that the bound approval check gates those exits.
      (Req: Lifecycle; Approval bindings cover legacy parking sources)
- [x] 12.2 Core domain model
      `docs/core/domain-model.md` (about lines 74–110, 147–151, 188–189)
      Approach: update the transition table and the drain-only paragraph; keep the event descriptions for `spec-approved` / `signed-off`.
      (Req: Lifecycle)
- [x] 12.3 Core errors
      `docs/core/errors.md` (`InvalidStateTransitionError` about lines 435–470, error table about line 947), `docs/core/overview.md` (error table about line 106)
      Approach: reduce `InvalidStateTransitionError` to the entity-level rejection; document `CheckPredicateFailedError` (`checkId`, `label`, `code`, `message`, `action`, `details`, `skippable`, `from`, `to`) and the per-code `details` contract; remove references to `approval-required`, `incomplete-*`, `SpecOverlapError`, `ArchiveDependencyMismatchError`.
      (Req: Shared runner errors propagate on transition; Check failures carry their own structured details)
- [x] 12.4 Core use cases
      `docs/core/use-cases.md` (about lines 194–200, 248, 564–617, 676), `docs/core/ports.md` (about line 372)
      Approach: `TransitionChange` / `ArchiveChange` error tables list `CheckPredicateFailedError`; remove the parked-state `approval-required` text; `ApproveSpec` / `ApproveSignoff` no longer transition legacy parking states; `GetStatus` `nextAction` is `intent` + `action`.
      (Req: Historic parked approval repair precedence; Approval recording and state transition)
- [x] 12.5 Custom checks ABI
      `docs/core/custom-checks.md` (about lines 22, 34–60, 85, 261–293)
      Approach: replace `command` on `CustomCheckDefinition` and results with `CheckAction` (namespaced kinds, `supersedesIntent`, `guidance`); document `details` as check-owned payload; update the example output of a failing check.
      (Req: Check-declared host-neutral actions)
- [x] 12.6 CLI reference and guides
      `docs/cli/cli-reference.md` (about lines 113–125, 158–180, 628–650), `docs/guide/cli.md` (about line 111), `docs/guide/custom-schemas.md` (about line 97)
      Approach: JSON/TOON examples show `intent` / `action` next to `command` / `bypassFlag`; `--next` from `pending-*` now resolves to `implementing` / `archivable`; archive failure rendering by check id; keep the `--skip-checks` flag documentation.
      (Req: Next flag from parked states; Error cases)
- [x] 12.7 Do not edit
      `docs/adr/*`, `apps/public-web/.docusaurus/*`, generated API pages
      Approach: ADRs are historical; generated API docs are rebuilt by `pnpm build`.
      (Req: n/a)

## 13. Skill templates, leftovers found in the final audit

- [x] 13.1 Skill templates for parked spec states
      `packages/skills/templates/skills/specd-implement/SKILL.md.tpl` (state gate about line 80, transition block about line 92), `skills/specd-new/SKILL.md.tpl` (rows about lines 150–155), `shared/shared.md.tpl` (about lines 482 and 602)
      Approach: `specd-implement` accepts `pending-spec-approval` next to `spec-approved` (transition when consent is recorded, otherwise redirect to human `approve spec`); the `specd-new` rows for `pending-*` say "approve while consent is missing, otherwise follow `nextAction`"; shared copy notes that approving in a drain state no longer moves the change. Regenerate bundled templates if the build does.
      (Req: In-place approval gates in workflow templates)
- [x] 13.2 Template contract tests
      `packages/skills/test/template-workflow.spec.ts`, `template-protocol.spec.ts`
      Approach: assert the new `specd-implement` gate, the `specd-new` row text, and that happy-path parking copy is still absent.
      (Req: In-place approval gates in workflow templates)
- [x] 13.3 CLI hint for dependency mismatches
      `packages/cli/src/error-hints.ts`: `CliHintId`, `CLI_ERROR_HINTS`, `CLI_ERROR_HINT_RULES`
      Approach: add a hint (re-run dependency extraction or update the change dependencies) keyed by the check id `deps.consistent` (rules are routed by `code`; `transition.ts` / `archive.ts` pass the check id as the code); keep the existing `--skip-checks` fallbacks.
      (Req: Error cases; Invalid transition error)
- [x] 13.4 Delete or rewrite stale tests found by search
      `packages/core/test/domain/errors/spec-overlap-error.spec.ts` (delete), `packages/core/test/application/use-cases/archive-change.spec.ts`, `packages/cli/test/handle-error.spec.ts`, `packages/cli/test/commands/change/archive.spec.ts`, `transition.spec.ts`
      Approach: remove assertions on `SpecOverlapError`, `ArchiveDependencyMismatchError`, and the deleted `InvalidStateTransitionError` reasons; assert `CheckPredicateFailedError` and rendered output instead.
      (Req: all group-11 scenarios)
- [x] 13.5 Generated artifacts
      `packages/guide/generated/guides-*.json`, `apps/public-web/.docusaurus/*`
      Approach: regenerated by `pnpm build` (documented build noise); do not hand-edit.
      (Req: n/a)

## 14. Verification remediation round (decisions taken after the first audit)

- [x] 14.1 Remove `redesign-spec`; `approval.spec` emits `approve-spec` for stale and missing consent
      `packages/core/src/domain/services/transition-checks.ts`, `packages/core/src/domain/checks/approval-spec.ts`, `packages/core/test/domain/checks/approval-spec.spec.ts`, `packages/core/test/application/services/lifecycle-guidance.spec.ts`
      Approach: delete `redesignSpecAction` and the `'redesign-spec'` member of `BuiltInCheckActionKind`; `APPROVAL_STALE` keeps its code and message but declares `approveSpecAction()`; replace every test that builds or expects `redesign-spec` by `approve-spec`.
      (Req: core:transition-checks "Check-declared host-neutral actions"; scenarios approval.spec emits approve-spec when approval is stale; Stale spec approval in ready asks for a fresh approval)
- [x] 14.2 Domain `nextHop` stops reading validity; checks and review own the rest
      `packages/core/src/domain/services/lifecycle-verdict.ts`, `packages/core/src/domain/services/check-bindings.ts`, `packages/core/test/domain/services/lifecycle-verdict.spec.ts`, `packages/core/test/domain/services/check-bindings.spec.ts`, `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: delete `projectValidityNextHop` and the `guidedTransitions` filter (no replacement hold anywhere); bind `verification.current` additionally for `done`, `pending-signoff`, `signed-off` → `archivable` (forward); rewrite the test at `lifecycle-verdict.spec.ts:1198`; add tests for stale approval in `designing` (incomplete → `designing`/`design`, complete → `ready`) and in `ready` (`approve-spec`), stale verification in `done` (stays, `start-verification`, intent `verify`), pending non-task review under `preserve`, the binding rows, and the disabled-`verifying` skip; add the missing domain tests for parked-state hops and `INVALID_TRANSITION` from `ready` to `pending-spec-approval`.
      (Req: core:lifecycle-engine "Next hop derives from candidate evaluation", "Application lifecycle guidance"; core:transition-checks "Verification currency bounds every verification-requiring exit")
- [x] 14.3 Verification validity blockers always carry an action
      `packages/core/src/domain/services/change-validity.ts` (`VERIFICATION_REQUIRED`, `VERIFICATION_IN_PROGRESS`), `packages/core/test/domain/services/change-validity.spec.ts`, `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: attach `start-verification` (or `refresh-status` where applicable) with `params.changeName` to the two blockers that lack it; assert all four codes, and that no `details.command` exists.
      (Req: core:lifecycle-engine "Machine-readable blockers"; scenario Every verification validity blocker carries an action)
- [x] 14.4 CLI presenter exposes `guidance` separately and drops the `redesign-spec` mapping
      `packages/cli/src/guidance-presenter.ts`, `packages/cli/src/commands/change/{status,transition,invalidate,verification,archive,approve}.ts`, tests under `packages/cli/test`
      Approach: `command` is a command or `null`; unknown kinds and missing `changeName` yield `guidance`; render guidance as a plain line in text, expose `guidance` in JSON/TOON; render blocker remediation in `verification` text output; cover status (gate action, intent wins, unknown plugin action, JSON/TOON additivity, drafted no-leak with real `intent`/`action` in the mock), transition (`approve spec` command, blocker bypass, real change name), invalidate (projection from intent), verification (remediation, missing `changeName`, no `nextAction` on start/complete), archive (`start-verification`, `deps.consistent`, `workspace.readOnly`), approve (JSON/TOON failure records).
      (Req: cli:change-status, cli:change-verification, cli:change-transition, cli:change-invalidate, cli:change-archive, cli:change-approve)
- [x] 14.5 One generic skippable-check hint; no input names in core messages
      `packages/cli/src/error-hints.ts`, `packages/cli/test/handle-error.spec.ts`, `packages/core/src/application/services/detect-impl-links-in-scope.ts`, `packages/core/test/application/services/detect-impl-links-in-scope.spec.ts`
      Approach: `impl.linksInScope` uses `Retry with --skip-checks <id> if an exception is granted` like every skippable check and no longer mentions `--allow-out-of-scope`; remove "Re-run with allowOutOfScope if intentional" from the core message and assert the message contains none of `--allow-out-of-scope`, `allowOutOfScope`, `--skip-checks`, `Re-run with`.
      (Req: cli:change-transition "CLI-rendered transition error hints", cli:change-archive "CLI-rendered out-of-scope implementation hint", core:transition-checks "Host-neutral impl.linksInScope message")
- [x] 14.6 `VerificationStaleError` is host-neutral and has a CLI hint
      `packages/core/src/application/errors/verification-stale-error.ts`, `packages/core/test/application/use-cases/approve-signoff.spec.ts`, `packages/cli/src/error-hints.ts`, `packages/cli/test/handle-error.spec.ts`
      Approach: message without `/specd-verify`; add `changeName` property; add a hint for `VERIFICATION_STALE` that renders the recovery command; assert no `specd`, `--`, `/specd-` in the message.
      (Req: core:approve-signoff "Signoff recording and state transition"; default:\_global/error-handling-conventions "Host-Neutral Core Errors and Delivery Hints")
- [x] 14.7 Archive recovery guidance comes from lifecycle evaluation
      `packages/core/src/application/use-cases/archive-change.ts` (`archiveRecoveryError`), `packages/core/test/application/use-cases/archive-change.spec.ts`
      Approach: project the committed-state `nextAction` with `evaluateLifecycle` and real forward-candidate checks (as `TransitionChange` and `InvalidateChange` do) instead of `designing ? 'design' : 'verify'`; test recovery to `designing` and to `done` with `verifying` disabled and the sign-off gate on.
      (Req: core:archive-change "Canonical validity archive preflight")
- [x] 14.8 Guidance uses one declarative state-to-phase table; legacy `pending-*` never yields `null`
      `packages/core/src/application/services/lifecycle-guidance.ts`, `packages/core/src/domain/services/lifecycle-verdict.ts` (drain offsets), `packages/core/src/application/use-cases/get-status.ts` (redundant action fallback), tests
      Approach: replace the `if` chain by a single table mapping state or hop target to one of the four phase intents, keeping enabled steps, the verification boundary and drain states derived from the topology; a blocked legacy state without hop action resolves its phase intent; remove the `GetStatus` fallback that promotes an action from an unrelated target; add the table and legacy-state scenarios.
      (Req: core:lifecycle-engine "Application lifecycle guidance"; scenarios Intent table carries no schema-dependent facts, Blocked legacy pending state keeps the phase intent)
- [x] 14.9 Remove leftover delivery syntax from core and add a contract test
      `packages/core/src` (`lifecycle-verdict.ts:522`, `get-status.ts:963`, `workflow-step.ts`, `transition-checks.ts`, `check-predicate-failed-error.ts`, `archive-change.ts:1457-1459` duplicated unclosed doc comment), `packages/core/test/domain/services/lifecycle-verdict.spec.ts`, `packages/core/test/application/services/lifecycle-engine.spec.ts`
      Approach: reword comments, JSDoc and test titles that name `--skip-checks`, `/specd-*` or `bypassFlag`; add a contract test that serializes representative `NextAction`, `Blocker`, `CheckResult` and validity projections and asserts none contains `specd `, `--` or `/specd-`.
      (Req: default:\_global/error-handling-conventions "Host-Neutral Core Projections")
- [x] 14.10 Docs, generated artifacts and full verification
      `docs/cli/cli-reference.md`, `docs/core/*.md`, `docs/guide/workflow.md`
      Approach: remove `redesign-spec`, document the `guidance` field and the generic skippable hint; regenerate artifacts with the normal build (never hand-edit generated files); run `pnpm typecheck`, `pnpm lint`, the affected package tests, then repeat verification with a new attempt.
      (Req: n/a)

## 15. Compliance audit remediation (second verification round)

- [x] 15.1 Core error messages stop naming use-case inputs and unprefixed commands
      `packages/core/src/domain/errors/depends-on-overwrite-error.ts`, `packages/core/src/application/errors/invalidate-requires-force-error.ts`, `packages/core/src/domain/errors/spec-not-initialized-error.ts`, `packages/cli/src/error-hints.ts`, tests
      Approach: remove "Pass force" and `run "specs init" first` from core messages; add CLI hints for the affected codes (including `SPEC_NOT_INITIALIZED`) and hint tests.
      (Req: default:\_global/error-handling-conventions "Host-Neutral Core Errors and Delivery Hints")
- [x] 15.2 Widen the static host-neutral contract test
      `packages/core/test/application/services/host-neutral-projections.spec.ts`
      Approach: also reject `--force`, `--next`, `--target`, `--set/--add/--remove/--clear`, `specd change ` and input names (`force`, `skipChecks`, `allowOutOfScope`) used as remedies in messages.
      (Req: default:\_global/error-handling-conventions "Host-Neutral Core Projections")
- [x] 15.3 `workspace.readOnly` message and `deps.consistent` merge-time error match the specs
      `packages/core/src/domain/checks/workspace-read-only.ts`, `packages/core/src/application/use-cases/archive-change.ts`, tests
      Approach: emit the prescribed readOnly message; make the merge-time `deps.consistent` error carry `from`/`to` and `skippable` from the resolved binding; fix stale `@throws` JSDoc in `archive-change.ts` and `approve-signoff.ts`; assert `details.specs/entries/mismatches/files` and replace the vacuous `typeof` assertions.
      (Req: core:archive-change "ReadOnly workspace guard", "Archive checks share runners")
- [x] 15.4 `change approve` prints the unchanged state
      `packages/cli/src/commands/change/approve.ts`, `packages/cli/test/commands/change/approve.spec.ts`
      Approach: success output (text and JSON) includes `state`; text failures print `guidance:` for null-command actions; fix the mock to match the real result.
      (Req: cli:change-approve)
- [x] 15.5 CLI projection fixes
      `packages/cli/src/commands/change/status.ts`, `verification.ts`, `archive.ts`, `invalidate.ts`, `transition.ts`
      Approach: drafted status renders blocker labels and projects blockers through the CLI presenter; route the archive overlap bypass sentence through the presenter; update `--help` JSON schemas for status, transition and approve (intent, action, guidance, bypassFlag, hint, state, approval); fix the over-long import in `archive.ts`.
      (Req: cli:change-status, cli:change-transition, cli:change-verification, cli:change-archive)
- [x] 15.6 Stale docstrings
      `packages/core/src/application/use-cases/transition-change.ts` (class and `execute` docs)
      Approach: describe the `CheckPredicateFailedError` model.
      (Req: core:transition-change)
- [x] 15.7 Missing tests listed by the audit
      `packages/core/test`, `packages/cli/test`, `packages/skills/test`
      Approach: add the tests for the scenarios the audit marked untested or weak: GetStatus blocker/nextAction actions for approve-spec and start-verification, discarded-only name, empty skipChecks on archive, canonical availableSteps order, null `nextArtifact`, blocker `action` preservation, `workflow.requires` `blockedBy`, `passMemo`, committed recovery intents in `TransitionChange` and `InvalidateChange`, parking states in approve-spec/signoff, status DAG dedup and overlap suffix, archive `deps.consistent`/`workspace.readOnly` listing, invalidate `--target`/`--force` hints, transition structured failure record and "Re-checking after hooks", `specd-new` routing row and both `specd-implement` consent branches, full-scan "no entry edge" and `pending-spec-approval` exit order.
      (Req: all specs of this change)
- [x] 15.8 Re-run full verification
      Approach: `pnpm typecheck`, `pnpm lint`, `pnpm test`, then a new verification attempt with a compliance audit.
      (Req: n/a)

## 16. Compliance audit remediation (third verification round)

- [x] 16.1 Archive surfaces stale verification as a check failure after hooks
      `packages/core/src/application/use-cases/archive-change.ts`, `packages/core/test/application/use-cases/archive-change.spec.ts`, `archive-change-audit.spec.ts`
      Approach: after the post-hook reconcile, re-run the archive predicates before `postHookValidityBlocksArchive`; if validity still blocks with no failing predicate, throw `ReconciledOperationBlockedError` instead of the generic `InvalidStateTransitionError`; update the test that fixed the generic behavior and add the `start-verification` and blocked-without-predicate cases. Keep the `archive-change.spec.ts` count of `uc.execute({ name:` lines unchanged or update the code-graph corpus count.
      (Req: core:archive-change "Canonical validity archive preflight")
- [x] 16.2 Invalidate force guard decides from the canonical verdict
      `packages/core/src/application/use-cases/invalidate-change.ts`, `packages/core/test/application/use-cases/invalidate-change.spec.ts`
      Approach: run an `observe` reconcile before the guard and derive `consentToRevoke` from `verdict.specApproval` / `verdict.signoff`; a persisted-valid but fingerprint-stale consent no longer requires `force`.
      (Req: core:invalidate-change "Approval guard")
- [x] 16.3 Archive implementation links and defaults follow the resolved binding
      `packages/core/src/application/use-cases/archive-change.ts`, `packages/core/src/domain/checks/*` (hook bindings)
      Approach: `_materializeImplementationLinks` takes `skippable` from the resolved `impl.linksInScope` binding; hook bindings declare explicit `skippable: false`; keep the documented `transitionBindings` default.
      (Req: core:archive-change, core:transition-checks Category A)
- [x] 16.4 Transition repair guide and structured failure
      `packages/cli/src/commands/change/transition.ts`
      Approach: print the check's `guidance:` together with the next-action `command:`; print the failed check's diagnostic code; project structured failure blockers through `projectCliBlocker` (no raw `isSkippable`).
      (Req: cli:change-transition)
- [x] 16.5 CLI projection leftovers
      `packages/cli/src/commands/change/status.ts`, `invalidate.ts`, `verification.ts`, `approve.ts`, `packages/cli/src/error-hints.ts`
      Approach: drafted status JSON uses the active display-status fallback; invalidate projects blockers and drops its hard-coded force line; `DEPENDS_ON_OVERWRITE` hint applies to every command that can surface it; complete `--help` schemas (status artifactDag fields and lifecycle, approve error under `metadata`).
      (Req: cli:change-status, cli:change-invalidate, cli:change-approve)
- [x] 16.6 Core message wording and barrel comment
      `packages/core/src/domain/errors/historical-implementation-guard-error.ts`, `packages/core/src/domain/services/lifecycle-engine.ts`
      Approach: replace "without force" with neutral confirmation wording; reword the barrel comment.
      (Req: default:\_global/error-handling-conventions)
- [x] 16.7 Missing tests listed by the round-2 audit
      `packages/core/test`, `packages/cli/test`
      Approach: cover the untested scenarios of the round-2 report: invalidate gate priority, workflow-only override, invalid policy value and idempotent output; transition-change evidence changed by hooks, missing verification verdict and missing-reconciler failures; transition-checks axis cases; approve-spec/signoff renewal only in ready and missing required artifact; lifecycle-engine absence of the class/options, exact `affectedArtifacts`, CompileContext spy, historical overlap intent; ValidateSchema approval-anchor; get-status implementationTracking and draft timestamp shortcut; the new CLI scenarios of section 16.
      (Req: all specs of this change)
- [x] 16.8 Re-run full verification
      Approach: typecheck, lint and tests, then a new verification attempt with compliance audit.
      (Req: n/a)

## 17. Spec consent renewal in ready (reconciler recovery rule)

- [x] 17.1 Do not request spec-consent recovery from `ready`
      `packages/core/src/domain/services/change-validity.ts` (`selectAutomaticRecovery`)
      Approach: add `state !== 'ready'` to the spec-consent branch. `approval.spec` already blocks leaving `ready`, so the return to `designing` adds nothing there and made a consent already recovered impossible to renew (every reconciliation in `ready` returned the change to `designing`). Sign-off and `workflow-redesign` recovery are unchanged. Interim: the per-gate declarative `recovery` of the state-checks change supersedes it.
      (Req: core:change "Policy-aware invalidation", scenario Stale consent stays in ready until it is renewed)
- [x] 17.2 Tests for the rule and the full renewal flow
      `packages/core/test/domain/services/change-validity*.spec.ts`, `packages/core/test/application/use-cases/approve-audit-2.spec.ts`
      Approach: unit-test `selectAutomaticRecovery` (ready: none for stale and revoked spec consent; implementing/verifying/done/archivable: designing; sign-off unaffected; redesign policy unaffected); replace the `it.skip` with the real flow `stale -> designing -> ready -> approve spec` ending in `ready` with a valid consent; assert that `GetStatus` in `ready` with a stale consent keeps the state and reports the `approve-spec` action.
      (Req: core:change, core:approve-spec)
- [x] 17.3 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 18. Compliance audit remediation (fourth verification round)

- [x] 18.1 Render a committed recovery in `change transition` and `change archive`
      `packages/cli/src/commands/change/transition.ts`, `archive.ts`, `packages/cli/test/commands/change/transition.spec.ts`, `archive.spec.ts`
      Approach: treat `ReconciledOperationBlockedError` like a repair-guide error: text shows the committed state, projected blockers (no raw `isSkippable`) and the projected next action; JSON/TOON carry `state`, `automaticReturn`, projected blockers and projected `nextAction`; never an invalid-edge line. Tests use the real error.
      (Req: cli:change-transition, cli:change-archive "Committed recovery is not rendered as an edge error")
- [x] 18.2 Transition and archive CLI details
      `transition.ts`, `archive.ts`, `error-hints.ts`
      Approach: one `bypass:` line per skippable blocker in the text repair guide; `deps.consistent` hint only for non-skippable blockers; archive passes the effective `skipHooks` to the progress presenter; `transition --help` nextAction schema lists `actionType`.
      (Req: cli:change-transition, cli:change-archive)
- [x] 18.3 Status, approve, invalidate and verification CLI
      `status.ts`, `approve.ts`, `invalidate.ts`, `verification.ts`
      Approach: `status --help` lists every emitted top-level and lifecycle field (validity, verification, invalidation, implementationTracking, approvalGates, lifecycle.checks, lifecycle.checksByTarget, artifact/file displayStatus and hasDrift); approve failure text prints the `error:` line first, then state, labelled blockers and next action, and enrichment never throws on read-only error properties; verification-invalidate blockers use the CLI blocker projection; tests for invalidate blocker projection and the single force hint.
      (Req: cli:change-status, cli:change-approve, cli:change-verification, cli:change-invalidate)
- [x] 18.4 Shared skill template documents the full next action
      `packages/skills/templates/shared/shared.md.tpl`, `packages/skills/test`
      Approach: list `targetStep`, `actionType`, `reason`, `intent`, `action`, `command`, `guidance` and the `command: null` plus `guidance` rule; contract test asserts them.
      (Req: skills:skill-templates-source)
- [x] 18.5 Force preview uses the effective policy; ready exemption coverage
      `packages/core/src/application/use-cases/invalidate-change.ts`, tests
      Approach: `forceRecoveries` receives the effective invalidation policy; tests for forced invalidation from `ready` (stays in ready under preserve, designing under redesign) and for the preview.
      (Req: core:invalidate-change "Approval guard", "Canonical gate-safe invalidation and recovery")
- [x] 18.6 Archive link materialization honors the bypass
      `packages/core/src/application/use-cases/archive-change.ts`, tests
      Approach: when `impl.linksInScope` is bypassed, out-of-codeRoot and unknown-workspace links are omitted from the sidecar; otherwise they fail as `CheckPredicateFailedError`; tests for both and for the post-hook guard branches (`artifactReviewRequired`, signoff).
      (Req: core:archive-change)
- [x] 18.7 Core test and doc gaps
      `packages/core/test`, `packages/core/src` (JSDoc), `docs/core/domain-model.md`
      Approach: TransitionChange test for stale consent at `ready`; assert explicit `skippable:false` on hook bindings (check-bindings spec stops filtering hook rows); fix the JSDoc of `transition-change.ts` and the `@throws` of `archive-change.ts`; fix `docs/core/domain-model.md` (rollback to `designing` does not apply from `ready` for spec consent); remove the stale `ready → designing` recovery stub in `invalidate-change-next-action.spec.ts`.
      (Req: core:transition-change, core:transition-checks, core:archive-change)
- [x] 18.8 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 19. Compliance audit remediation (fifth verification round)

- [x] 19.1 Transition CLI parity
      `packages/cli/src/commands/change/transition.ts`, `packages/cli/src/guidance-presenter.ts`, tests
      Approach: one `bypass:` line per skippable blocker also when the error is a `CheckPredicateFailedError` (deduplicated against the failed check); render the `CHECK_NOT_SKIPPABLE` hint (text and JSON `hint`); add `error: { code, message, checkId? }` to the JSON/TOON failure record plus the bypass `hint` for a skippable check failure; reconciled text guide prints blocker `action`; per-phase `--skip-hooks` reason.
      (Req: cli:change-transition)
- [x] 19.2 Approve, status, invalidate and verification CLI
      `approve.ts`, `status.ts`, `invalidate.ts`, `verification.ts`, tests
      Approach: approve failure blockers print as `! CODE — label: message`; `status --help` describes every listed field (test asserts descriptions); `parseFormat` runs before the mutation in `approve` and `invalidate`; verification mismatch prints `error:` before guidance; invalidate next action passes blockers for the overlap bypass suffix.
      (Req: cli:change-approve, cli:change-status, cli:change-invalidate, cli:change-verification)
- [x] 19.3 Archive link materialization with a disabled check
      `packages/core/src/application/use-cases/archive-change.ts`, tests
      Approach: when the effective archive bindings do not contain `impl.linksInScope`, omit out-of-scope links like the bypass case; test for the disabled case and for the `postHookValidityBlocksArchive` `specApproval` and verification branches.
      (Req: core:archive-change)
- [x] 19.4 Core consistency and test gaps
      `packages/core/src`, `packages/core/test`
      Approach: `build-schema.ts` uses `isDrainState`; JSDoc of the `transition-change.ts` constructor and `@throws VerificationInProgressError` in `approve-signoff.ts`; fixture in `transition-change-audit.spec.ts` uses `implementing` as recovery source; GetStatus-level test for stale consent in `ready`; `artifactReviewRequired` preview matches the reconciler verdict; drop the unreachable `spec-approval` from `ready` entry of `RECOVERY_ONLY_TRANSITIONS`.
      (Req: core:get-status, core:invalidate-change, core:approve-signoff, core:transition-change, core:workflow-topology)
- [x] 19.5 Docs
      `docs/guide/configuration.md`, `docs/adr/0028-materialized-validity-reconciliation.md`
      Approach: carve `ready` out of the "later than `designing`" wording; add a superseding note to the ADR instead of rewriting it.
      (Req: n/a)
- [x] 19.6 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 20. Compliance audit remediation (sixth verification round)

- [x] 20.1 Core tests and preview parity
      `packages/core/src/application/use-cases/invalidate-change.ts`, `approve-spec.ts`, `approve-signoff.ts`, `packages/core/test`
      Approach: `previewArtifactReviewRequired` also counts hash-only drift like the reconciler, with a test; `@throws` of both approve use cases lists the schema-resolution errors; tests for `EditChange` scope edit in `ready` (no automatic return) and for a stale consent in `spec-approved` / `signed-off` (recovered first, then renewal outcome).
      (Req: core:edit-change, core:invalidate-change, core:approve-spec, core:approve-signoff)
- [x] 20.2 CLI tests and docs
      `packages/cli/test`, `docs/cli/cli-reference.md`
      Approach: `change-edit` CLI test for the `ready` scenario; transition TOON assertion for `error`/`hint`; dedupe test for two blockers sharing a `checkId`; invalidate overlap suffix in `nextAction.reason`; `cli-reference.md` documents `--skip-checks`/`--allow-overlap` for transition and the failure record, and drops the "check-specific bypass hint" wording for archive.
      (Req: cli:change-edit, cli:change-transition, cli:change-invalidate, cli:change-archive)
- [x] 20.3 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 21. Compliance audit remediation (seventh verification round)

- [x] 21.1 Recovery from legacy parking states
      `packages/core/src/domain/value-objects/change-state.ts`, tests
      Approach: add `'pending-signoff': 'done'` to the `signoff` recovery table; tests for stale sign-off in `pending-signoff` and stale approval in `pending-spec-approval` (real reconciler: recovery committed, no throw); table test that every state later than each cause's target has an entry.
      (Req: core:change "Policy-aware invalidation")
- [x] 21.2 Core consistency
      `packages/core/src`, `packages/core/test`
      Approach: share one review-target helper between the reconciler and `previewArtifactReviewRequired`; discriminating test for the preview; `lifecycle-guidance.ts` returns `'design'` for artifact review directly; JSDoc `@throws` for `ArchiveChange` (execute and constructor) and `TransitionChange.execute` (`SchemaNotFoundError`); test for the compact ">3 examples" `impl.linksInScope` message.
      (Req: core:invalidate-change, core:get-status, core:archive-change, core:transition-change)
- [x] 21.3 CLI tests
      `packages/cli/test`
      Approach: realistic `details` for the `deps.consistent` fixture, replace the tautological assertion at `transition.spec.ts` (~:2292), test for the non-skippable `deps.consistent` `hint:` line; `verification.ts` passes blockers to `projectCliNextAction`.
      (Req: cli:change-transition, cli:change-verification)
- [x] 21.4 Docs
      `docs/core/custom-checks.md`, `docs/cli/cli-reference.md`, `docs/core/errors.md`, `docs/adr/0028-materialized-validity-reconciliation.md`
      Approach: guidance-only action shows `guidance:`; JSON blockers do not carry `isSkippable`; `checkCode` property name; `VERIFICATION_STALE` entry stays host-neutral; missing comma; ADR 0028 line 46 states the recovery priority with the `ready` exception inline.
      (Req: n/a)
- [x] 21.5 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 22. Compliance audit remediation (eighth verification round)

- [x] 22.1 Guidance tests and JSDoc
      `packages/core/src`, `packages/core/test`
      Approach: direct `lifecycle-guidance.spec.ts` tests for the three new lifecycle-engine scenarios (preserve + drift routes to `design`; `artifactReviewRequired` alone routes to `design`; stale verification at `verifying` outranks review); `@throws SchemaProviderIdentityMismatchError` on `TransitionChange.execute` and `ArchiveChange.execute`, plus `SchemaNotFoundError` on `InvalidateChange.execute`; correct the `@throws {Error}` of `ArchiveChange._prepareSpecPublicationPreflight`; helper test for a file that is both drifted and pending-review; rename the transition-change test title that still says "downgrades artifacts"; test for forced revocation from `ready` under `redesign` with no pending review (stays in `ready`).
      (Req: core:lifecycle-engine, core:archive-change, core:transition-change, core:invalidate-change)
- [x] 22.2 CLI test
      `packages/cli/test/commands/change/change-invalidate.spec.ts`
      Approach: assert the `--force` hint appears exactly once in the invalidate failure output.
      (Req: cli:change-invalidate)
- [x] 22.3 Docs
      `docs/core/errors.md`, `docs/core/overview.md`, `docs/core/custom-checks.md`, `docs/core/domain-model.md`, `docs/core/use-cases.md`, `docs/cli/cli-reference.md`
      Approach: `CheckPredicateFailedError.code` is the check's own `checkCode` (`CHECK_FAILED` only as fallback); `deps.consistent` details are `{ mismatches: [{ specId, extracted, persisted }], specIds }`; drafted `nextAction` has `command: null` and no `intent`/`action` keys; from `ready` the spec recovery target is the current state and `workflow-redesign` still applies from `ready`; refresh the repair-guide sample in `custom-checks.md`; GetStatus section of `use-cases.md` describes `nextAction.intent` and `action`.
      (Req: n/a)
- [x] 22.4 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 23. Compliance audit remediation (ninth verification round)

- [x] 23.1 Status blocker deduplication
      `packages/core/src/application/use-cases/get-status.ts`, tests
      Approach: `_mergeBlockers` identifies a validity blocker and a check failure as the same by code plus `checkId` (a validity blocker has no `checkId`, so match on code when the check failure carries the same code), keeping the check's message, label, `checkId` and action; test with the real validity and check messages for `VERIFICATION_IN_PROGRESS` and `VERIFICATION_STALE` asserting a single blocker; GetStatus-level test for preserve plus pending review (intent `design`, `targetStep` `designing`, state retained, no recovery).
      (Req: core:get-status, core:lifecycle-engine)
- [x] 23.2 Core cleanup and tests
      `packages/core/src`, `packages/core/test`
      Approach: remove `EditChange._isNoOp` and the unreachable unscaffold/refresh branch (confirm unused with the graph); `@throws ArchiveOrphanBackupError`, `DeltaApplicationError`, `ArtifactParseError` on `ArchiveChange.execute`; tests: `listBypassedWorkflowSteps('ready','done')` is `[]`, converse of the approval-snapshot scenario, `specDependsOn` is not overwritten by `EditChange`, status display order for a non-canonical schema order, nextHop ignores validity in `verifying` with stale verification, lifecycle test for `preserve` that asserts the state is not changed.
      (Req: core:edit-change, core:workflow-topology, core:workflow-model, core:lifecycle-engine, core:archive-change)
- [x] 23.3 CLI consistency
      `packages/cli/src/commands/change/transition.ts`, `packages/cli/test`
      Approach: JSON mode detects `CheckPredicateFailedError` with the same rule as text mode (instance or name fallback) with a test; CLI-level `change-edit` tests for removing a spec not in the change and for workspace derivation where the mocked kernel allows it.
      (Req: cli:change-transition, cli:change-edit)
- [x] 23.4 Docs
      `docs/cli/cli-reference.md`, `docs/core/use-cases.md`, `docs/core/errors.md`, `docs/core/custom-checks.md`, `docs/cli/change-verification.md` (or the page that documents `change verification`)
      Approach: the CLI presenter builds the bypass (`--skip-checks <checkId>`) from core's `isSkippable` and `checkId`; `predicateCode` becomes `checkCode`; ApproveSpec/ApproveSignoff accept the legacy parking states too; the ArchiveChange error table includes `archiving`; `skippable` is optional and the `details` lists mention `byArtifact`, `peers`, `specIds`; refresh the repair-guide sample (error line wording and trailing `reason:`); remove "terminal states" under `--next`; document the projected fields in the verification page.
      (Req: n/a)
- [x] 23.5 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit.
      (Req: n/a)

## 24. Compliance audit remediation (tenth verification round)

- [x] 24.1 Core code and tests
      `packages/core/src`, `packages/core/test`
      Approach: `_mergeBlockers` pairs a validity blocker with a check failure by code and gate (spec consent `APPROVAL_*` with `approval.spec`, sign-off with `approval.signoff`, `VERIFICATION_*` with `verification.current`), so a sign-off failure never replaces the spec-consent blocker and sign-off consent is reported once; `EditChange` constructor takes `reconcile` as required; own-property check in `build-schema.ts`; JSDoc: drop "drain-only" from the `TransitionChange` class doc, widen `InvalidStateTransitionError` `@throws`, add the plain `Error` (missing hasher) and `HookFailedError` (after-persist) to `ArchiveChange.execute`, reword the "CLI flags" comment in `archive-change.ts`; tests: twin merge by gate for APPROVAL*\*/SIGNOFF*_/VERIFICATION\__ incl. spec plus sign-off both broken at `done`, overlap override drops the check action, `isPermitted` for a skipped blocker, reason wording of a blocked hop without approval wording, blocked `ready` without action has no intent and stale verification at `archivable` chooses the verify intent (if the code does so), `ArtifactParseError` propagation, missing `ContentHasher` path, after-persist hook abort, four-argument `change.transition` call, `resolveEditChangeDeps` equivalence, rename the mislabeled edit-change test.
      (Req: core:get-status, core:lifecycle-engine, core:edit-change, core:archive-change, core:transition-change)
- [x] 24.2 CLI code and tests
      `packages/cli/src`, `packages/cli/test`
      Approach: `archive.ts` recognises `CheckPredicateFailedError` with the shared predicate used by `transition.ts` (move the helper to a shared module); `change edit --help` schema lists the full output (`scopeChanged`, `validityChanged`, `blockers`, `nextAction`, automatic return); tests: name-only `CheckPredicateFailedError` in text mode for transition and archive, help schema for edit.
      (Req: cli:change-archive, cli:change-transition, cli:change-edit)
- [x] 24.3 Docs
      `docs/cli/cli-reference.md`, `docs/guide/workflow.md`, `docs/core/errors.md`, `docs/core/custom-checks.md`, `docs/core/overview.md`
      Approach: approve states say "ready (or a legacy parking state)" and "done (or a legacy parking state)"; archive text prints the bare bypass hint for `spec.overlap` entries; `TransitionFailureReason` documents `status` and `blockedBy`; repair-guide sample includes the validity lines; overview error table lists `UNSUPPORTED_MANIFEST_VERSION`.
      (Req: n/a)
- [x] 24.4 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with compliance audit limited to what changed in this round plus a new-problem sweep.
      (Req: n/a)

## 25. Compliance audit remediation (eleventh verification round)

- [x] 25.1 Blocker merge by condition family
      `packages/core/src/application/use-cases/get-status.ts`, tests
      Approach: replace `validityTwinCode` by a family mapping (spec consent, sign-off consent, verification) as the get-status spec states; a check failure of a family drops all validity blockers of that family; `approval.signoff` VERIFICATION\_\* failures yield to `verification.current`; never merge `VERIFICATION_VALIDITY_UNAVAILABLE` or per-artifact codes; confirm the `archiveSkippable ?? transitionSkippable` lookup cannot give a transition blocker the archive binding's skippability; tests: revoked sign-off once, signed-off with absent/stale/in-progress verification once, stale spec plus failing sign-off twice, spec `APPROVAL_REVOKED` merges, `VERIFICATION_VALIDITY_UNAVAILABLE` stays.
      (Req: core:get-status)
- [x] 25.2 Overlap override only when overlap is the only blocker
      `packages/core/src/application/use-cases/get-status.ts` (`_nextActionAfterArchiveOverlap`), tests
      Approach: apply the override only when every blocker is a live `OVERLAP_CONFLICT`; otherwise keep the guidance result; flip the pinned test and add a stale-verification plus overlap case asserting `verify` and the `start-verification` action; the CLI suffix test stays on intent `archive`.
      (Req: core:lifecycle-engine, core:get-status, cli:change-status)
- [x] 25.3 Archive debug logging
      `packages/core/src/application/use-cases/archive-change.ts`, tests
      Approach: implement the 'Archive debug logging' requirement fully: spec.overlap and workspace.readOnly guard outcomes (spec ids checked, overlap entries, readOnly workspaces), pre-hook logs with step, phase and skipped phases, direct-versus-delta flag for tracked artifacts, metadata-generation skip reason, preflight-failed logs with change, step and specId; Logger-spy tests asserting the key logs.
      (Req: core:archive-change)
- [x] 25.4 Core small fixes
      `packages/core/src`, `packages/core/test`, `packages/sdk`
      Approach: `skipChecks` validated before the `designing -> designing` early return; force preview computes the single combined recovery for the revoked gate set; export `AutomaticRecovery` and `ChangeValidityVerdict` from core and sdk (barrel tests) and type the CLI accessors; remove dead `void change; void schema` parameters in `transition-change.ts`; rename the edit-change test whose title still says "metadata fallback"; tests: stale/revoked spec approval at `ready` commits no recovery, non-archivable change reports `InvalidStateTransitionError` before any predicate failure, one reconciliation commits one recovery (sign-off then redesign over two calls), `skipChecks` bogus id on `designing -> designing`; investigate (report, do not redesign) whether `TransitionChange` and `ArchiveChange` re-validate after the post-hook re-check inside the final mutation.
      (Req: core:transition-change, core:invalidate-change, core:change, core:archive-change)
- [x] 25.5 CLI fixes and tests
      `packages/cli/src`, `packages/cli/test`
      Approach: `change edit` text prints blockers as status does (label, `bypass:` line) and a test asserts JSON/TOON blockers are projected (`bypassFlag` present, `isSkippable` absent); invalidate test with skippable blockers; tighten weak `toContain` assertions in `reconciled-blocked.spec.ts` and `cli-audit-round-2.spec.ts` (count lines); fix the `SPEC_OVERLAP` fixture code in `transition.spec.ts`; use the exported types instead of duck-typing `automaticReturn`/`validity`; use one shared helper for the `CheckNotSkippableError` name-or-instance check in `transition.ts`.
      (Req: cli:change-edit, cli:change-transition, cli:change-invalidate, cli:change-verification)
- [x] 25.6 Re-run full verification
      Approach: typecheck, lint, tests; then a new verification attempt with a compliance audit of the round's changes and a new-problem sweep.
      (Req: n/a)

## 26. Compliance audit remediation (twelfth verification round)

- [x] 26.1 Force guard and preview honour disabled gates
      `packages/core/src/application/use-cases/invalidate-change.ts`, tests
      Approach: `consentToRevoke` and `forceRecoveries` consider only gates enabled in the configured approvals; a valid consent of a disabled gate is revoked without force and previews nothing; tests: spec gate off + valid spec approval in implementing/verifying/done (no force needed, state unchanged), sign-off on and spec off (only sign-off listed, target done), only sign-off revoked previews done; extend the combined-preview test with gate-off and sign-off-only rows; add a mutation-sensitive revoked-spec-at-ready case (ready exemption must not mask `isBrokenConsent('revoked')`).
      (Req: core:invalidate-change)
- [x] 26.2 Blocker merge details
      `packages/core/src/application/use-cases/get-status.ts`, tests
      Approach: a merged blocker's skippability combines per target (skippable only if skippable on every target it appears on); dedupe key does not merge two distinct checks; tests: reverse skippability direction, per-target conflict, adopted action reaches the winning check blocker, blocker ordering, two blockers at `done` with exact messages and checkIds.
      (Req: core:get-status)
- [x] 26.3 Public types and small core items
      `packages/core/src`, `packages/sdk`, `packages/guide`, `packages/cli/test`
      Approach: export `ArtifactReviewTarget`, `ProjectionChange`, `ValidityBlocker`, `FingerprintInputFailure`, `ProjectionStatus`, `InvalidateChangeResult` and `ReconcileChangeValidityResult` (types) from core public and sdk, with barrel tests; update the catalog counts asserted in `packages/guide/test/integration/sdk-catalog.spec.ts` and `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts`; archive metadata-failure log gets a `step`; commit, archive-move and snapshot failure logs carry `specId` when the failure is spec-scoped; test for `hook.pre` non-skippable on `designing -> designing`; only-sign-off-revoked force preview test.
      (Req: core:archive-change, core:transition-change, core:invalidate-change)
- [x] 26.3b Remaining log tests
      `packages/core/test`
      Approach: tests for the metadata-skip log, the `source: 'delta'` case and the restore `restoredSpecIds`/`failedSpecIds` fields.
      (Req: core:archive-change)
- [x] 26.4 CLI fixes and tests
      `packages/cli/src`, `packages/cli/test`
      Approach: `change edit` text prints `guidance:` when `command` is null; one shared builder for the `nextAction` record in `edit.ts`, `invalidate.ts` and `status.ts` through `projectCliNextActionRecord`; the status call inside the repair-guide catch of `transition.ts` cannot mask the original error; tests: edit text with guidance and null command, text/JSON/TOON blocker parity for edit, `readAutomaticReturn` unit test, repair-guide failure when the status call throws.
      (Req: cli:change-edit, cli:change-transition)
- [x] 26.5 Docs
      `docs/cli/cli-reference.md`
      Approach: the `change edit` section documents blockers, next action, the `bypass:` line and the JSON `blockers` and `nextAction` fields.
      (Req: n/a)
- [x] 26.6 Re-run full verification
      Approach: typecheck, lint, tests; then a final verification attempt.
      (Req: n/a)

## 27. Compliance audit remediation (thirteenth verification round)

- [x] 27.1 Merged blocker skippability across contexts
      `packages/core/src/application/use-cases/get-status.ts`, tests
      Approach: an archive failure with the same check, code and message as a transition failure ANDs its skippability into the merged blocker instead of being skipped; tests for both orders (transition skippable plus archive locked, and the reverse) and for a case that exercises `attemptFor`/`bindingMatches` (a mutation of `applicable ?? sameCheck[0]` to `sameCheck[0]` must fail).
      (Req: core:get-status)
- [x] 27.2 Archive logging
      `packages/core/src/application/use-cases/archive-change.ts`, `packages/core/src/infrastructure/fs/archive-batch-snapshot.ts`, tests
      Approach: orphan outcome logged in both cases and corrupt manifest abort logged; restore start/completed/failed, cleanup and created-file logs carry `change`; preflight-failed log distinguishes plan preparation from full-batch preflight (`phase`, distinct message, no hardcoded misleading code); "before-persist effects completed" only on success; `guardDetails` null-safe; Logger tests for the adapter (`archive-batch-snapshot.spec.ts`) and for the changed use-case logs; Logger spies restored in `afterEach`.
      (Req: core:archive-change)
- [x] 27.3 Public types
      `packages/core/src`, `packages/sdk`, `packages/guide/test`, `packages/cli/test/commands/guide-sdk`
      Approach: export `ValidityStatusProjection`, `ApprovalStatusProjection`, `VerificationStatusProjection`, `ProjectionInvalidation` and `ValidityInvalidationCause` from core public and sdk; re-export `FingerprintDifference`, `ValidityFingerprint` and `InvalidationPolicyOverride` from sdk; type-equality tests; run a TypeScript walk over the exported result types to prove no referenced type is left unexported; update the asserted catalog counts.
      (Req: core:get-status, core:invalidate-change)
- [x] 27.4 Invalidate gate tests
      `packages/core/test`
      Approach: disabled sign-off gate with valid consent, history event for a disabled gate revocation, legacy parking states with a disabled gate, redesign combined with a disabled gate, re-enabling a gate does not restore a revoked consent.
      (Req: core:invalidate-change)
- [x] 27.5 CLI tests
      `packages/cli/test`
      Approach: TOON variant of the transition status-failure test; JSON and TOON `guidance` for `change edit` when `command` is null; rename the two tautological workspace tests of `change edit` so they say they check rendering of the workspaces returned by core.
      (Req: cli:change-transition, cli:change-edit)
- [x] 27.6 Re-run full verification
      Approach: typecheck, lint, tests; then the final verification attempt.
      (Req: n/a)

## 28. Compliance audit remediation (fourteenth verification round)

- [x] 28.1 Blocker skippability per blocker
      `packages/core/src/application/use-cases/get-status.ts`, tests
      Approach: key the skippable maps by check id and message; remove the archive fallback for verdict blockers without a failing transition predicate and fix the `_mergeBlockers` comment; rename the test 'each attempt resolves its own binding' so it states what it asserts (or fix the assertion to the new rule); tests: different messages of the same check keep their own skippability, verdict blocker without predicate takes nothing from archive, a test that kills the archive pre-seed AND to OR mutant (several archive bindings of one check id with different skippability).
      (Req: core:get-status)
- [x] 28.2 Archive snapshot adapter robustness
      `packages/core/src/infrastructure/fs/archive-batch-snapshot.ts`, tests
      Approach: manifest that is not a JSON object or lacks a string `changeName` aborts as corrupt `ArchiveOrphanBackupError` (logged before the throw), never foreign; absent manifest logged `none-found`, other read failures logged `unreadable`, unknown workspace logged `skipped-unknown-workspace`; tests in `archive-batch-snapshot.spec.ts` for null manifest, manifest without `changeName`, unreadable manifest, unknown workspace, and assertions on `foreignChangeName` and the message.
      (Req: core:archive-change)
- [x] 28.3 Invalidate tests
      `packages/core/test`
      Approach: re-enable cases (sign-off gate, `ready`, a legacy parking state) and the mixed enabled/disabled consent without force (guard throws, nothing revoked).
      (Req: core:invalidate-change)
- [x] 28.4 CLI tests and docs
      `packages/cli/test`, `docs/cli/cli-reference.md`
      Approach: strengthen the TOON/JSON failure-record test of transition (no `blockers`, `nextAction`, `state`, `validity`; exit code asserted) and add the `CheckPredicateFailedError` variant plus a no-repair-guide assertion in text; broaden the `.catch(` guard in `run.spec.ts` to any callback shape and to `src/helpers` keeping the single allowlisted use; `cli-reference.md` says that a failing status read keeps the original error.
      (Req: cli:change-transition)
- [x] 28.5 Final gates and Simple verification
      Approach: full gates (build, typecheck, lint, prettier, tests, corpus count) then a Simple verification attempt and completion.
      (Req: n/a)

## 29. Compliance audit remediation (fifteenth verification round)

- [x] 29.1 Unreadable backup manifest aborts the archive
      `packages/core/src/infrastructure/fs/archive-batch-snapshot.ts`, `packages/core/src/domain/errors/archive-orphan-backup-error.ts` (JSDoc only), tests
      Approach: a manifest that exists but cannot be read for a reason other than absence is logged as `unreadable` and aborts with `ArchiveOrphanBackupError` (message states the manifest cannot be read, `foreignChangeName` false) before any snapshot; JSDoc of the error documents the three cases (foreign, recovered, corrupt or unreadable); tests: unreadable manifest aborts and leaves the backup directory and canonical files untouched, corrupt manifest leaves them untouched too.
      (Req: core:archive-change)
- [x] 29.2 Blocker merge without a family
      `packages/core/src/application/use-cases/get-status.ts`, tests
      Approach: remove the `anonymousKey` absorption for predicate failures whose code has no family; tests: a predicate failure with `ARTIFACT_REVIEW_REQUIRED` and the same `code:message` as a checkId-less verdict blocker stays a separate blocker with its own `checkId`; verdict blocker with the same check id and message as an archive failure does not take the archive skippability; verdict blocker with `isSkippable` undefined or true against a transition predicate that resolves differently takes the resolved value.
      (Req: core:get-status)
- [x] 29.3 Guard comment stripping
      `packages/cli/test/run.spec.ts`
      Approach: comment stripping must not truncate a line at `//` inside a string (`://` in URLs); test with a line that contains `'https://x'` followed by a `.catch(` on the same line.
      (Req: n/a)
- [x] 29.4 Final gates and Simple verification
      Approach: full gates (build, typecheck, lint, prettier, tests, corpus count) then a Simple verification attempt and completion.
      (Req: n/a)

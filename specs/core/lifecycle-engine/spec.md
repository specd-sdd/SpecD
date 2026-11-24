# Lifecycle Engine

## Purpose

Unifying lifecycle validation, artifact status, and repair diagnostics into a single source of truth is critical to preventing "liar context" and ensuring consistent system behavior. Domain lifecycle interpretation is a set of plain functions (`evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`) that combine the change's persisted state with schema-defined workflow rules. Application `evaluateLifecycle` attaches the public host-neutral `nextAction` (`intent` and optional check-declared `action`); delivery mechanisms render commands from it. There is no `LifecycleEngine` class.

## Requirements

### Requirement: Stateless domain lifecycle verdict

Lifecycle interpretation in the domain layer MUST be implemented as plain exported functions (exported through `domain/services/lifecycle-verdict.ts`), not as a class:

- `evaluateLifecycleVerdict(change, schema, options)` — projects predicate `CheckResult`s, effective artifact statuses, blockers, review summary, and `nextHop`.
- `projectArtifacts(source, schema)` — pure DAG effective-status projection (no I/O).
- `findBlockingParent(...)` — recursive parent-review helper for artifact status; implemented in `domain/services/find-blocking-parent.ts` and re-exported from `lifecycle-verdict.ts`.

There MUST NOT be a `LifecycleEngine` class, constructor, injected debug port, or compatibility alias (`LifecycleEngineOptions`). Domain services MAY call `Logger.debug` from [`default:_global/logging`](../../../_global/logging/spec.md) for diagnostics only.

The public domain return type is `LifecycleDomainVerdict`. It MUST NOT include `command`, `bypassFlag`, or any CLI/skill command string. Host-neutral action intents are resolved in the application layer (Requirement: Application lifecycle guidance).

The verdict option that lists check ids the caller bypassed MUST be named `skippedCheckIds` (a list of host-neutral check identifiers such as `spec.overlap` or `@plugin.check`). The domain MUST NOT parse, strip, or accept CLI flag syntax (`--skip-checks`, `--allow-overlap`) in that option; delivery hosts translate their flags to check ids before calling core.

### Requirement: Centralized validation logic

`evaluateLifecycleVerdict` SHALL be the sole domain authority for interpreting a change's state within a project's workflow. It MUST unify validation into **one transition-attempt evaluation** as defined by [`core:transition-checks`](../transition-checks/spec.md):

1. **Protocol** — `protocol.edge` against `VALID_TRANSITIONS`. `TransitionChange` fail-fasts this check. `GetStatus` MUST still collect every matching predicate for the hop (no fail-fast) so the repair guide can show the full why. The verdict function projects from the `CheckResult`s the caller supplies.
2. **Schema-derived predicates** — `workflow.requires` and `workflow.taskCompletion` for the requested target.
3. **Core-bound predicates** — registered `from` / `to` / `along` (and archive operation, which domain evaluation does not execute).

`evaluateLifecycleVerdict` MUST evaluate **predicates** only (project from `CheckResult`s supplied by the caller). It MUST NOT run `run:` effects. It MUST NOT take a global snapshot bag. It MUST NOT fall back to `check.run` against snapshots when `checksByTarget` is missing. Matching checks perform I/O in `execute`; the domain layer MUST NOT perform those I/O reads.

Callers MAY run `projectArtifacts` to compute DAG effective statuses for `CheckExecutionContext` **before** check `execute`. That helper MUST NOT perform I/O and MUST NOT be a second availability algorithm.

### Requirement: Effective artifact status computation

Artifacts may contain multiple files (e.g., one per spec ID). The `Change` entity persists an _aggregated_ state for the artifact based on its files. `projectArtifacts` MUST compute the logical (effective) status of every artifact by combining this aggregated persisted state with its dependency chain.

The public domain contract is `evaluateLifecycleVerdict(...)` (plus `projectArtifacts` for DAG-only callers). Effective artifact statuses are returned as part of that verdict; callers MUST NOT depend on a separate public `computeEffectiveStatus(...)` API.

These functions exist specifically because the entity does not know the schema artifact DAG. Persisted aggregate status and history remain on `Change`; dependency-aware effective status is derived here.

**Mapping Rules:**

- If the aggregated state is `drifted-pending-review`, its effective status remains `drifted-pending-review`.
- If the aggregated state is `pending-review`, its effective status remains `pending-review`.
- If the aggregated state is `complete` but a required upstream effective status is `pending-review`, `drifted-pending-review`, or `pending-parent-artifact-review`, its effective status SHALL be `pending-parent-artifact-review`.
- If the aggregated state is `complete` but a required upstream is otherwise not `complete` or `skipped` (`missing`, `in-progress`, …), its effective status SHALL be `in-progress`.
- If both a review-blocked parent and an otherwise-incomplete parent apply, `pending-parent-artifact-review` wins.
- In any other case, the effective status matches the aggregated persisted state (`missing`, `in-progress`, `complete`, `skipped`).

`projectArtifacts` MUST detect recursive blocks: if Spec B depends on Spec A, and Spec A is `pending-review`, Spec B's effective status becomes `pending-parent-artifact-review`.

### Requirement: Canonical-state-only lifecycle interpretation

`evaluateLifecycleVerdict` / `projectArtifacts` SHALL interpret only canonical artifact/file workflow states when deriving effective status, blockers, review routing, and transition eligibility.

Display-only projections such as `complete-with-drift` and diagnostic fields such as `hasDrift` MUST NOT be treated as additional lifecycle states.

Consequently:

- when policy `none` leaves a file canonically `complete` but drift-visible in status rendering, the verdict still treats it as `complete`
- when canonical state becomes `missing`, `pending-review`, or `drifted-pending-review`, the verdict uses those canonical states normally

### Requirement: Machine-readable blockers

For every condition that prevents a transition or marks an artifact as incomplete, the verdict function MUST provide a structured `LifecycleBlocker` object containing:

- `code`: A unique machine-readable identifier.
- `message`: A human-readable description.
- `isSkippable`: Boolean indicating if the blocker can be bypassed through the orchestrator check-bypass input.
- `checkId`: (Optional) The check identifier that produced this blocker when projected from a predicate. `isSkippable` SHALL come from the resolved binding of the failing check (from `LifecycleVerdictInput.resolvedBindings` when supplied by the caller, or resolved from `schema` against the built-in binding specifications when omitted); when the resolved binding has `skippable: false`, `isSkippable` MUST be `false`. Blockers MUST NOT carry CLI `bypassFlag` strings.
- `action`: (Optional) The host-neutral `CheckAction` propagated unchanged from the failing `CheckResult` when present.
- `affectedArtifacts` (optional): Detail identifying the specific artifact IDs and files.

If a blocker is skippable and its `checkId` is listed in `skippedCheckIds`, the function MUST omit that blocker from `blockers` (it MUST NOT remain as a transition blocker). `LifecycleDomainVerdict` has no `warnings` field; active bypass MUST NOT invent a warning channel.

Verification validity blockers (`VERIFICATION_STALE`, `VERIFICATION_REQUIRED`, `VERIFICATION_IN_PROGRESS`, `VERIFICATION_VALIDITY_UNAVAILABLE`), which are emitted by the `verification.current` check and projected by the verdict, MUST express remediation as `action: CheckAction` (`start-verification` or `refresh-status`, each with `params.changeName`) and MUST NOT carry `details.command` or any CLI command string.

**Mandatory Blocker Codes:**

- `INCOMPLETE_ARTIFACT`: A required artifact is not ready (`missing` or `in-progress`). There is no separate `MISSING_ARTIFACT` code.
- `ARTIFACT_DRIFT`: An artifact has changed on disk since its last validation (state: `drifted-pending-review`).
- `REVIEW_REQUIRED`: An artifact was invalidated or downgraded and requires review (state: `pending-review`).
- `PENDING_PARENT_REVIEW`: An artifact is blocked because one of its upstream dependencies requires review.
- `INCOMPLETE_TASKS`: An artifact contains unfinished checklist items (e.g., `- [ ]`).
- `OVERLAP_CONFLICT`: Live overlap with **other active** changes from archive `spec.overlap` (GetStatus runs those predicates when `state === 'archivable'`). MUST NOT be emitted only because `review.reason` is `'spec-overlap-conflict'` (victim of another archive; that is review + design).
- `INVALID_TRANSITION`: The requested target is not in `listWorkflowTransitions(change.state, schema, approvals)` from the current state.
- `APPROVAL_REQUIRED`: A bound approval predicate failed (stay in `ready` / `done`).

For file-level blockers (drift, review, parent review), the `affectedArtifacts` field MUST contain a grouped list identifying the specific artifact IDs and the exact filenames/paths that triggered the blocker.

### Requirement: Available steps and domain next hop

- `availableSteps` SHALL be extras-bearing `schema.workflow()` lookup rows in canonical pipeline order as computed by `resolveWorkflowPipeline(schema, approvals)`; the order in which rows are declared carries no meaning. Disabled steps SHALL be excluded from `availableSteps`.
- Every forward/backward or position comparison inside lifecycle verdict code (including verification boundaries and optional-step walks) SHALL derive from `resolveWorkflowPipeline(schema, approvals)` and `isWorkflowStepEnabled`; hardcoded lifecycle state lists MUST NOT be used.
- Protocol participation and legal transitions SHALL be computed via `listWorkflowTransitions(change.state, schema, approvals)`. An omitted canonical row defaults to enabled.
- `isReady`: Whether all required artifacts for the step are logically complete/skipped. MUST be projected from `workflow.requires` check results when those results are present — MUST NOT independently re-walk `requires` to emit a second blocker code for the same artifact. When those results are present, `blockingArtifacts` MUST come from the failed `workflow.requires` `details.artifactId` (empty when that check passed or skipped), not a second independent `requires` walk. Required artifacts that are `missing` or `in-progress` both use `INCOMPLETE_ARTIFACT`. When `checksByTarget` is empty or lacks an entry for a transition, `transitionBlockers` for that transition MAY use the DAG-only `requires` walk (same artifact readiness as `projectArtifacts`) without running hop predicates.
- `isPermitted`: Whether `protocol.edge` allows the pair as determined by `isWorkflowTransitionLegal(from, to, schema, approvals)`. Disabled steps are never permitted. For `IMPLEMENTATION_STATE`, only `impl.linksInScope` failures are skippable (the resolved binding declares `skippable: true`; delivery hosts translate that capability and the `checkId` into their own bypass syntax); `impl.filesResolved` failures are not.

`checksByTarget` MUST contain the complete result of the shared candidate evaluator for each target, including normal transition predicates and every applicable `step-skip` predicate for bypassed optional steps. `availableTransitions` MUST include only targets whose complete candidate result is allowed. Lifecycle verdict code MUST NOT reconstruct a parallel bypass decision from topology alone.

Based on that evaluation plus change-level review blockers, `evaluateLifecycleVerdict` MUST recommend a single domain `nextHop`:

- `nextHop.targetStep` — the recommended next lifecycle hop selected by Core from the active ordered pipeline and predicate-filtered `availableTransitions`.
- `nextHop.actionType` — `cognitive` or `mechanical`.
- `nextHop.reason` — human prose explaining why that hop is recommended.

`nextHop` MUST NOT include `command`, `intent`, or any CLI or agent-command string. Host-neutral intents are resolved in the application layer (Requirement: Application lifecycle guidance) and delivery hosts render commands from them.

**Optional-step recommendation policy:**

- `nextWorkflowStep` retains its narrow meaning: the closest enabled step after the current state.
- Core guidance MUST NOT blindly use that immediate step when it is optional.
- Starting after the current state, Core SHALL walk consecutive optional steps. It SHALL recommend the furthest forward target present in `availableTransitions` that bypasses only optional intermediates whose effective `step-skip` predicates passed.
- If a shortcut is unavailable because any skip predicate failed, Core SHALL recommend entering the closest optional step when that immediate transition is available.
- An optional step with no effective `step-skip` bindings has an unconditional passing bypass and is skipped by the default recommendation.
- Disabled steps are absent from the active pipeline and therefore never appear as either recommended or alternative targets.
- Explicit user targets remain valid alternatives when present in `availableTransitions`; the recommendation selects the default path only.
- Skills MUST consume the resulting `nextAction` as the preferred default and MUST NOT recompute Core's recommendation. An explicitly invoked lifecycle skill MAY select its own target only when that target is already present in `availableTransitions`.

**Domain happy-path hop matrix (when the listed hop is in `availableTransitions`):**

- `designing` (or `drafting` after entering design work) recommends the first mandatory target after bypassing any consecutive optional steps whose shortcuts are available. While required design artifacts are incomplete → `targetStep: designing`.
- `implementing` with `verifying` available → `targetStep: verifying`; when `verifying` is disabled and `done` is available → `targetStep: done`; otherwise `targetStep: implementing`.
- `verifying` with `done` available → `targetStep: done`; otherwise `targetStep: verifying`.
- `ready` with missing required spec approval → `targetStep: ready` (MUST NOT recommend a hop to `pending-spec-approval`). When approval is satisfied and `implementing` is mandatory, recommend `implementing`. When `implementing` is optional and its bypass predicates pass, recommend the next available target after it; when they fail, recommend entering `implementing`.
- `done` with missing required signoff → `targetStep: done`. When signoff is satisfied (or off) and `archivable` is available → `targetStep: archivable` (MUST NOT recommend the archive operation hop while still in `done` / `signed-off`).
- `signed-off` with `archivable` available → `targetStep: archivable`.
- `archivable` → `targetStep: archiving`.
- When `review.reason` is `'spec-overlap-conflict'`, `nextHop.targetStep` MUST be `designing`.

Skill-aligned backward hops from `done` / `signed-off` / `archivable` to `implementing` / `verifying` MUST appear in `availableTransitions` when predicates allow them. Those hops MUST NOT become the default `nextHop`.

**Archiving state guidance:**

When `change.state` is `archiving`:

- `validTransitions` MUST include `archivable` and `designing`.
- If the most recent `archive-failed` event has `commitStarted: true` and batch restore did not complete, `nextHop` MUST recommend manual review and transition to `designing` (`targetStep: designing`) rather than retrying archive blindly.
- If no blocking restore failure is recorded, `nextHop` MAY recommend retrying archive (`targetStep: archiving`) or transitioning to `designing` when artifact revision is required.

### Requirement: Next hop derives from candidate evaluation

The domain `nextHop` MUST be derived only from the review summary, the predicate-filtered `availableTransitions`, the active pipeline, and the transition topology. It MUST NOT read approval projections (`activeSpecApproval`, `activeSignoff`), the `approvals` gates, or `boundFromStates` to decide whether to stay in place. A recommendation that stays in the current state because the forward candidate is not in `availableTransitions` (for example while `approval.spec` fails) is the generic "remaining blockers" outcome, and the failed check explains it through `hopFailures`. At `ready` that outcome is `targetStep: ready`, `actionType: 'mechanical'`, with a reason that names remaining blockers and no approval wording.

For any drain-only state, the verdict MUST apply one rule without naming individual drain states: when `nextWorkflowStep(state, schema, approvals)` is non-null and present in `availableTransitions`, recommend it as a mechanical hop; otherwise stay in the current state. It MUST NOT recommend another drain state.

When a requested target is not legal for the current state, the verdict MUST report generic `INVALID_TRANSITION` from the topology. It MUST NOT keep dedicated messages keyed on target names such as `pending-spec-approval`, `spec-approved`, `pending-signoff`, or `signed-off`.

A single derivation of the verification boundary MUST serve every consumer: `isAtOrAfterVerificationBoundary(state, schema, approvals)`. Reconciliation and verification invalidation MUST call it and MUST NOT keep their own lists of boundary states.

Stale or revoked spec consent and stale or revoked sign-off are NOT inputs of the domain `nextHop`. Recovery for them is committed by reconciliation before projection: spec consent in a state after `ready` returns the change to `designing` (in `ready` no recovery is committed because `approval.spec` blocks leaving `ready` and consent is renewed there), sign-off returns a change later than `done` to `done`. After that commit the `nextHop` is computed by the ordinary rules above (`designing` while design artifacts are incomplete, `ready` once they are complete, and in place while the forward candidate is blocked), and the remediation is declared by the failed `approval.spec` / `approval.signoff` check of the hop the recommendation waits on. Neither the domain `nextHop` nor the transitions it recommends from MAY read any part of the reconciled validity verdict, and no application step may re-apply a hold on top of it. Verification currency is owned by the `verification.current` check (bound to every verification-requiring exit, see `core:transition-checks`), which removes the blocked targets from `availableTransitions` and declares `start-verification`, so the recommendation stays in place without a special case. Pending non-task artifact review is owned by the review summary derived from the change's artifact files (`review.required`, `REVIEW_REQUIRED` / `ARTIFACT_DRIFT` blockers), which already routes the recommendation; the reconciler persists those file states before the verdict is computed.

Because stale spec consent leaves the projection in place until a new approval is recorded, a change in `designing` with complete design artifacts MUST recommend `ready`, and a change in `ready` MUST recommend staying in `ready` with the `approve-spec` action declared by `approval.spec`; neither state MAY keep recommending `designing` on account of the stale projection.

### Requirement: Application lifecycle guidance

Application code MUST map a domain `nextHop` plus change context into a public `LifecycleNextAction` (`targetStep`, `actionType`, `reason`, `intent`, and optional `action`) in `application/services/lifecycle-guidance.ts`, without embedding CLI command strings, flags, or agent slash commands:

- `LifecycleActionIntent` is strictly a workflow phase: `'design' | 'implement' | 'verify' | 'archive'`. It MUST NOT enumerate gates, approvals, or check-specific remediations.
- `resolveLifecycleIntent(change, nextHop, review, availableTransitions, approvals, schema, validity, hopFailures)` returns `{ intent: LifecycleActionIntent | null; action?: CheckAction }`. `hopFailures` is the ordered list of failed predicate `CheckResult`s of the hop the recommendation is waiting on (the target of `nextHop`, or the forward candidate that kept `nextHop` in place), in resolved-binding order.
- **Check-declared action precedence (deterministic):** only `hopFailures` are considered. The first failed result whose `action` is defined becomes `nextAction.action`; later failures MUST NOT override it. Failures of other hops, other candidates, or review-only blockers MUST NOT contribute an action. When the selected action does not declare `supersedesIntent: false` (default `true`), `nextAction.intent` MUST be `null`. When it declares `supersedesIntent: false` (for example `start-verification`), `nextAction.intent` keeps the phase value owning the target and the action stays informational for hosts.
- `lifecycle-guidance.ts` MUST NOT reference `approval.spec`, `approval.signoff`, `verification.current`, `boundFromStates`, `activeSpecApproval`, `activeSignoff`, `validity.specApproval`, `validity.signoff`, `pending-spec-approval`, `pending-signoff`, or match on `nextHop.reason` text. Gate, stale-consent, and verification remediation (`nextAction.action`) come exclusively from check-declared `CheckAction`s. Guidance MAY read the reconciled validity facts `verification`, `artifactReviewRequired`, and `recovery`, and the `review` summary, only to choose the phase intent (`'verify'` when verification is stale, absent, or attempt-active at or after the verification boundary with no committed recovery and `verifying` enabled; `'design'` for required review, meaning `review.required` or the reconciled `artifactReviewRequired` (the two are derived independently and either one suffices), or a workflow-redesign recovery; the `'verify'` condition is evaluated first, so stale, absent or attempt-active verification at or after the verification boundary outranks required review); they MUST NOT derive any action from them. A change found in a legacy `pending-*` state resolves to the phase intent of its pipeline position.
- Intent resolution SHALL use the already selected `nextHop.targetStep`; it MUST NOT recompute a different target via `nextWorkflowStep`. When intermediate steps are disabled or optional-and-bypassable, phase resolution resolves the intent owning the selected target rather than falling into fixed-sequence loops.
- When the current state is `done` or `signed-off` and `nextHop.targetStep` is `archivable` (or `archivable` is in `availableTransitions`) and no `hopFailures` action applies, `intent` MUST be `'archive'`.
- `'verify'` MUST only be recommended when `verifying` is enabled in the change schema. When `verifying` is disabled, a blocked `done` (or later) state MUST resolve its guidance from the actual failing check action (for example `action: { kind: 'approve-signoff' }`) or from `'design'` / `'implement'` / `'archive'`, and MUST NOT route to `'verify'`.
- Guidance MUST decide which steps are active, which states belong to the verification boundary, and which drain states exist from `resolveWorkflowPipeline(schema, approvals)` and `isWorkflowStepEnabled`. The only fixed vocabulary it MAY keep is a small set of declarative lookup tables (for example one keyed by the current state and one keyed by the hop target) that map a lifecycle state or hop target to one of the four fixed phase intents (`design`, `implement`, `verify`, `archive`); those tables MUST NOT encode schema-dependent facts (enabled steps, boundaries, optional bypasses). Any remaining branching MUST be derived from topology facts (state, `nextHop.targetStep`, `verifying` enablement, drain-state exits) and MUST NOT re-encode the table contents.
- `intent` is `null` only when the phase has no applicable intent: (a) the selected action does not declare `supersedesIntent: false`; (b) a legacy `pending-*` drain state whose exit `nextWorkflowStep(state, schema, approvals)` is `null` (for example `implementing` disabled); or (c) a blocked `ready` (hop stays in place) whose failures declare no action. A blocked change in a legacy `pending-*` state with an existing exit whose hop declares no action MUST still resolve the phase intent of the exit's target, not `null`.
- When `review.reason` is `'spec-overlap-conflict'`, `intent` MUST be `'design'`.
- When public blockers include live `OVERLAP_CONFLICT` from archive predicates while `state === 'archivable'` and it is the ONLY public blocker (no other blocker remains), `intent` MUST remain `'archive'` and `targetStep` MUST remain `archivable`. `GetStatus` applies this override after guidance and it replaces the guidance result, so no check-declared `action` is carried in that case; the overlap blocker stays visible in `blockers`. When other blockers exist (for example stale verification or an unresolved review), `GetStatus` MUST keep the guidance result unchanged so that `nextAction` points at the real next step (for stale verification: `intent: 'verify'`; the `start-verification` action stays on the verification blocker and `nextAction.action` is not set, because only the failed predicates of the selected hop can supply it and the archive operation is not a hop) and no overlap-bypass advice is implied.

`application/services/lifecycle-evaluation.ts` MUST expose `evaluateLifecycle(change, schema, options)` that calls `evaluateLifecycleVerdict`, derives `hopFailures` from the verdict's `checksByTarget`, then attaches `nextAction` via lifecycle guidance. Use cases that need full public lifecycle answers (`GetStatus`, `TransitionChange` when projecting guidance, `InvalidateChange`) MUST consume `evaluateLifecycle`, not the domain functions directly.

DAG-only consumers (`ValidateArtifacts`, `GetArtifactInstruction`) MAY call `evaluateLifecycleVerdict` with empty `checksByTarget` when they need only `projectArtifacts` / `nextArtifact` and MUST NOT attach intents or actions.

### Requirement: Archiving escape transitions in lifecycle verdict

When evaluating a change in `archiving` state, `evaluateLifecycleVerdict` MUST expose `archivable` and `designing` in both `validTransitions` and `availableTransitions` unless a non-skippable blocker unrelated to lifecycle validity prevents the target step.

`archiving → archivable` is `along = recovery`. Transition blockers for that hop MUST NOT include workflow `requires` or `workflow.taskCompletion` — returning to `archivable` after a failed commit is not entry into a workflow step and MUST NOT be treated as `backward`.

Transition blockers for `archiving → designing` MUST follow the same invalidation semantics enforced by `TransitionChange` when entering `designing` from other states (`along = redesign`).

### Requirement: Review summary integration

The engine MUST detect and report **Drift** (physical content changes since last validation) and **Overlap** (conflicts with specs targeted by other archived changes) as part of the blocking diagnostics.

### Requirement: Shared lifecycle interpretation for consumers

Use cases that need DAG-aware lifecycle answers MUST consume the lifecycle evaluation surface rather than reimplementing schema interpretation locally.

This includes, at minimum:

- status/reporting consumers that need effective artifact status, blockers, check-derived `availableTransitions`, and public `nextAction` — `evaluateLifecycle`
- transition consumers that need predicate evaluation and gated availability (then run effects themselves) — `evaluateLifecycleVerdict` for projection; guidance only when returning public `nextAction`
- validation consumers that need dependency-order checks or recursive blocker context — `evaluateLifecycleVerdict` with empty `checksByTarget`
- instruction consumers that need to determine which artifact is next in the DAG — `evaluateLifecycleVerdict` with empty `checksByTarget`

`GetStatus` and `TransitionChange` MUST NOT re-run `requires` / task / deps / readOnly / impl-exit as a second independent gate after a green `execute` of matching predicates for the same attempt.

`ValidateArtifacts` and `GetArtifactInstruction` MUST obtain DAG-aware answers from `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts` / `nextArtifact` only). They MUST NOT run hop predicates (`executeChecksByLegalTargets`). They MUST NOT gather a global snapshot bag (`gatherPredicateSnapshots` MUST NOT exist).

Hop `availableTransitions` MUST come from predicate `CheckResult`s when those results are supplied. DAG `isReady` / parent-review MAY still use `projectArtifacts` when `checksByTarget` is empty. `CompileContext` MUST NOT be required to call lifecycle evaluation.

There MUST NOT be a `LifecycleEngine` class in domain or application. Public API is `evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`, `resolveLifecycleNextHop`, and application `evaluateLifecycle`. Domain `lifecycle-engine.ts` MUST only re-export those domain functions and types (input type is `LifecycleVerdictInput`).

### Requirement: Next artifact topological order

When deriving the recommended next artifact for a change, `evaluateLifecycleVerdict` MUST scan artifacts in `schema.artifactDag().topologicalOrder()` and return the first artifact id whose effective status is neither `complete` nor `skipped` and whose required dependencies are effectively satisfied (`complete` or `skipped`).

Declaration order in `schema.artifacts()` MUST NOT be used as a proxy for DAG order for this selection.

If every artifact is effectively `complete` or `skipped`, the verdict MUST report no next artifact (`null`).

### Requirement: Predicate blocker artifact identity

When `evaluateLifecycleVerdict` projects `transitionBlockers` from a failed `workflow.requires` predicate, it MUST preserve the blocking artifact ID from the predicate details. The projected `blocking` array MUST contain that artifact ID so lifecycle consumers receive the same actionable target as other blocker projections.

## Spec Dependencies

- [`core:change`](../change/spec.md) — Source of persisted state facts (hashes, history, base status).
- [`core:workflow-model`](../workflow-model/spec.md) — Source of workflow transition rules and task gating requirements.
- [`core:schema-format`](../schema-format/spec.md) — Source of artifact requirements and schema structure.
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — Defines service layer boundaries.
- [`default:_global/logging`](../../../_global/logging/spec.md) — Ambient Logger exception for domain diagnostics.
- [`core:transition-checks`](../transition-checks/spec.md) — Check identity, `from`/`to`/`along`, predicate evaluation, projections.
- [`core:workflow-topology`](../workflow-topology/spec.md) — Authoritative domain service computing ordered pipeline, reachability, and legal transitions.
- [`core:resolve-change-schema`](../resolve-change-schema/spec.md) — Shared sovereign schema resolution used by application projections.

# Transition Checks

## Purpose

Status, repair guides, and `change transition` currently answer “may this change move from A to B?” with different rules, so agents see available steps that execute would reject. This spec defines the shared evaluation of one transition attempt (and of the archive operation): the check registry attaches reusable checks according to `from` / `to` / `along` (or operation `archive`), each with a kind (predicate vs effect). Projections (`allowed`, `availableTransitions`, `nextAction`) MUST come from that evaluation, not from parallel if-ladders.

Human approval gates are checks on the delivery edge. They MUST NOT be implemented as `change transition` into `pending-spec-approval` or `pending-signoff`. The change stays in `ready` or `done` until `ApproveSpec` / `ApproveSignoff` records consent; then the same delivery edge becomes `allowed`.

## Requirements

### Requirement: Check identity and result

Every check SHALL have a stable `id` (for example `protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, `deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `impl.linksInScope`, `approval.spec`, `approval.signoff`, `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `hook.pre`, `hook.post`). `archive.publication` MUST NOT be a `CheckId` and MUST NOT be a registered check.

Every check SHALL also declare a mandatory human-readable `label`: a short **gerund** phrase describing the work in progress (for example `Checking implementation links`, `Running post hooks`, `Checking workspace ownership`). The `label` MUST NOT use an `Executing:` prefix. The `id` remains the machine key; the `label` is for progress UI and human diagnostics.

A check result SHALL include:

- `id`
- `label` (same value as the check’s declared label)
- `kind`: `predicate` or `effect`
- `outcome`: `pass`, `fail`, or `skip`
- `code` and `message` when `fail` (reuse existing codes where they exist: `INVALID_TRANSITION`, `INCOMPLETE_TASKS`, `INCOMPLETE_ARTIFACT`, `APPROVAL_REQUIRED`, and the archive typed-error codes)
- optional `details` (artifact ids, task counts, resolve command, skippable/`bypassFlag`)

`instruction:` workflow hooks MUST NOT appear as checks.

### Requirement: Check ABI create and WorkflowCheck

The public ABI of a check SHALL be:

- `Check` — `id`, `label`, `kind` (`predicate` or `effect`), `execute(ctx): Promise<CheckResult>`
- `WorkflowCheck` — abstract application class implementing `Check`. It SHALL provide `pass` / `fail` / `skip` helpers. It MUST NOT take a shared snapshot bag, `needs`, or `RunStepHooks` on the base.
- `create<Name>(deps)` — named factory that returns a `Check` compatible with `WorkflowCheck` (application core checks SHALL `extend WorkflowCheck`). Domain modules MAY export a pure `run(facts)` plus a stub `Check` object; they MUST NOT be the production `execute` path. Each factory’s `deps` SHALL be only the ports that **that** check’s `execute` uses.

`execute` SHALL be self-sufficient: it obtains any I/O it needs through the instance’s constructor deps. A domain `run` helper, if present, SHALL accept **only that check’s facts** (plus Change/Schema already in `ctx`). There SHALL be no `PredicateSnapshots` type (exported or internal), no `emptyPredicateSnapshots`, and no `gatherPredicateSnapshots`. Checks MUST NOT declare a `needs` catalog.

`CheckExecutionContext` SHALL be the host of the attempt only: `change`, `schema`, `attempt` (`transition` triple or `archive`), baked `approvals` (`spec` / `signoff`), `skipHookPhases`, skippable flags (`allowOverlap`, `allowOutOfScope`), optional DAG `effectiveStatusByArtifact` from a **pure** lifecycle helper (`projectArtifacts` or equivalent), an optional **`onCheckProgress`** sink for the generic progress bus, and an optional **`passMemo`** (ephemeral map created once per `executeChecksByLegalTargets` / `TransitionChange` predicate pass). `workflow.taskCompletion` MUST memoize `CountTasks` on `passMemo`, not on the Kernel-lived check instance. It MUST NOT list task counts, deps extracts, or other check-specific facts as durable context fields. `skipHookPhases` matching SHALL use binding `phase` plus skip selectors (`target.pre`, `source.post`, archive `pre`/`post`), not `check.id === 'hook.pre'|'hook.post'` in the use-case loop. Transition `hook.pre` and `hook.post` both bind `phase = before-persist`, so skip MUST also use the effect’s pre/post identity (or equivalent selector), not `binding.phase` alone.

Applicability, `phase`, and `onFailure` SHALL live on the **binding row**, not on `WorkflowCheck`.

A later plugin SHALL register the same `Check` ABI (factory + instance). Core use cases MUST NOT `switch` on `CheckId` to gather facts, map `skipHookPhases`, or launch hooks. Mapping a **failed predicate** `id` to an existing typed error SHALL be allowed. Shipping plugins is out of this spec. Built-in ids MAY be a closed TypeScript union of the ids listed in this spec; that union MUST NOT be treated as the plugin ABI. Runtime ids are stable strings.

### Requirement: One implementation file per check

Each check id SHALL be implemented in its own module pair as needed (pure rule vs `execute`). The application type SHALL declare `id` and `kind` on the class; `kind` MUST NOT be omitted or inferred from `id`. The check MUST NOT declare applicability (`from` / `to` / `along` or operation `archive`). Shared matcher, `classifyAlong`, and bindings MAY live in sibling modules; they MUST NOT embed another check’s `execute` body.

### Requirement: Applicability from, to, and along

The **check registry** SHALL declare applicability as `from`, `to`, and `along` (wildcards allowed) on bindings that reference a check. The same check object MAY be bound to more than one attempt (for example enter-`ready` and operation `archive`).

`along` SHALL be one of:

- `forward` — `to` is posterior to `from` on the progress axis
- `backward` — `to` is anterior on that axis (retry)
- `redesign` — `to` is `designing`
- `recovery` — archive rollback (`archiving → archivable`)
- `any` — no direction filter

The progress axis SHALL start from `schema.workflow[]` declaration order of **known** `ChangeState` lookup rows. Missing delivery states SHALL be **spliced** into that axis in canonical `AXIS_FALLBACK` order (`ready`, `implementing`, `verifying`, `done`, `archivable`, `archiving`), inserting each omitted fallback at the index that preserves fallback relative order — not pushed after later listed steps. Tail-append MUST NOT invert retry (`verifying → implementing` MUST remain `backward` when `implementing` is omitted). `drafting` and `designing` MUST NOT be members of `AXIS_FALLBACK`. Strings that are not `ChangeState` MUST NOT occupy axis slots. That order MUST NOT mean consecutive steps are mandatory. Omitting a `workflow[]` row MUST NOT remove the named state from `VALID_TRANSITIONS`.

`from = *` / `to = *` without `along` MUST NOT be used when it would confuse `ready → designing` with `ready → implementing`.

Sugar MAY be used in authoring; the stored contract is the triple:

- `onEnter(S)` → `to = S`, `from = *`, `along = any` unless specified
- `onExit(S, along)` → `from = S`, `to = *`
- `onEdge(A, B)` → exact pair

### Requirement: Archive is an operation not an edge

The archive use case SHALL evaluate checks bound to operation `archive`, not a fake lifecycle `from → to`. `approval.signoff` MUST NOT be bound to that operation.

### Requirement: Binding pipeline phase and failure policy

Every **effect** binding SHALL declare:

- `phase`: `before-persist` or `after-persist` — which use-case slot runs the effect
- `onFailure`: `abort` or `collect` — abort the operation (`HookFailedError`) or record the failure and continue

The use case SHALL open those slots around persist. It MUST iterate matching bindings for the current slot. It MUST NOT hardcode `hook.pre` / `hook.post` to decide timing, failure policy, skip mapping, or whether to call `execute`. `skipHookPhases` SHALL map to binding `phase` plus skip selectors (`target.pre` / `source.post` / archive `pre`/`post`). `source.pre` and `target.post` MAY be accepted as no-ops until a binding uses those slots.

`before-persist` effects run after predicates pass and before the operation’s persist. `after-persist` effects run after the operation has committed. Transition `hook.post` SHALL remain `before-persist` (it completes the source step before `mutate`). Archive `hook.post` SHALL be `after-persist`.

### Requirement: Predicate versus effect

`predicate` checks SHALL determine `allowed` for status and MUST pass before execute runs effects.

`effect` checks are `run:` hooks. They MUST NOT count toward status `allowed` (unknown until run). Execute SHALL run matching effects after all predicates pass (and, for `after-persist`, after persist). Failure handling SHALL follow binding `onFailure` (`abort` → `HookFailedError` and no persist when still before persist; `collect` → record and continue). `--skip-hooks` SHALL skip effects only.

The matcher for predicates and effects SHALL be the same (`from` / `to` / `along` or operation `archive`).

Execute MUST select effects by binding `phase` and MUST apply binding `onFailure`. Execute MUST NOT choose slot or fail-soft vs fail-fast by comparing `check.id` to `hook.pre` or `hook.post`.

### Requirement: Evaluation of a transition attempt

For a candidate edge (`from` = current state, `to` = requested target):

1. Classify `along` for the requested pair. There is **no** approval routing rewrite: the requested target is the target.
2. Run `protocol.edge` against `VALID_TRANSITIONS`. On `TransitionChange` execute, fail-fast if it fails. On `GetStatus`, collect it with every other matching predicate (no fail-fast).
3. For every registered **predicate** whose binding matches the attempt, call `check.execute(ctx)` (schema `workflow.requires` and `workflow.taskCompletion` still use `to` = requested target).
4. Set `allowed` when no blocking predicate failed (`skip` is not a failure).
5. On execute only: for matching **effects** whose binding `phase` matches the current slot, call `check.execute(ctx)`, then persist (or, for `after-persist`, after persist). Apply each binding’s `onFailure`.

`ApproveSpec` / `ApproveSignoff` remain separate commands. They MUST record consent on the change and MUST NOT call `TransitionChange` into a pending state.

### Requirement: Shared validity verdict and recovery priority

A pure shared evaluator SHALL derive one canonical verdict from a fresh change snapshot, resolved schema, configured gates and policy, current artifact files, and current confirmed implementation files. The verdict SHALL independently report artifact review, spec approval, sign-off, verification, task completion, current-state validity, blockers, affected inputs, reasons, required recovery, and recommended next action.

Recovery priority SHALL be deterministic:

1. required stale or revoked spec approval returns immediately to `designing`
2. otherwise required stale or revoked sign-off returns a later change to `done`
3. stale verification blocks applicable verification-requiring boundaries at `verifying` or later and recommends renewing evidence in place, without mandatory lifecycle movement
4. otherwise artifact drift uses `invalidation.workflow`, while `preserve` retains state

Recovery never advances a change already earlier than its target. Unresolved non-task drift or pending review blocks every applicable forward transition even under artifact policy `none`. Verification staleness does not block entry into `verifying`. Required task presence, structure, and completion are evaluated live at their configured boundaries and archive.

### Requirement: Single validity reconciliation owner

One application-level reconciler SHALL be the sole orchestration path that acquires fresh file facts, evaluates the canonical verdict, materializes artifact review and approval/verification status changes, appends audit events, selects automatic recovery, and persists the complete result atomically.

`GetStatus`, `ValidateArtifacts`, `ApproveSpec`, `ApproveSignoff`, `TransitionChange`, `ArchiveChange`, `EditChange`, `InvalidateChange`, `StartVerification`, `CompleteVerification`, and `InvalidateVerification` SHALL delegate to it. Repository hydration, individual checks, CLI handlers, and skills MUST NOT independently invalidate gates, choose recovery, or append return transitions.

The reconciler SHALL return the reconciled change, canonical verdict, affected inputs, reasons, and any committed return. Repeated reconciliation of unchanged facts is idempotent. Callers SHALL request a fresh reconciliation after hooks or mutations that may change inputs; a manifest-mtime-only cache cannot prove external-file freshness.

The application owner SHALL be implemented as the typed `ReconcileChangeValidity` use case. It exposes `execute(input): ReconcileChangeValidityResult`, canonical `createReconcileChangeValidity(deps)`, convenience `createReconcileChangeValidity(config, options?)`, and `resolveReconcileChangeValidityDeps(resolver)`. The config form uses `normalizeCompositionFactoryArgs` and delegates to canonical deps construction; options with the deps overload produce the standard invalid-factory-arguments error. Its deps contain the repository mutation boundary, schema/config inputs, actor resolution, implementation tracking/link resolution, and shared fingerprint calculation without duplicating filesystem bootstrap or constructing an entire kernel.

Every mutating use-case dependency path SHALL provide this reconciler. A direct deps overload with no reconciler MUST fail construction or execution with a typed configuration error and MUST NOT fall back to `Change.invalidate(...)` or another legacy mutation path.

### Requirement: Registry bindings for this capability

The following predicate bindings SHALL remain registered with stable ids:

- `protocol.edge` for every normal transition attempt
- `workflow.requires` for the requested target's schema step
- `workflow.taskCompletion` from `requiresTaskCompletion`
- `deps.consistent` and `workspace.readOnly` for entry to `ready` and archive
- `impl.filesResolved` and `impl.linksInScope` for every transition whose target is `verifying`, every forward transition whose source is `implementing`, and archive; both are blocking predicates evaluated before the requested operation, and existing archive bypass rules remain unchanged. Explicit verification start reuses these checks through an operation-specific context before capturing its baseline, regardless of lifecycle state, without fabricating a self-transition
- `verification.current` for `verifying → done`: a blocking predicate requiring already-completed successful evidence with a current fingerprint; an active attempt alone cannot pass. It uses the same freshness evaluator as `CompleteVerification`, without invoking completion or mutating evidence. Missing, unavailable, stale, legacy-unknown, mismatched, and unresolved inputs produce structured actionable failures. It skips only when the canonical verdict explicitly reports `not-required`; an absent verdict fails closed
- `approval.spec` from `ready` along forward edges: skip when disabled; pass only when the reconciled materialized spec-approval projection is `valid` for current inputs; otherwise fail with `APPROVAL_REQUIRED` and an absent/stale/revoked reason; never route to a pending state
- `approval.signoff` for `done → archivable`: skip when disabled; pass only when reconciled sign-off and verification evidence are current and `valid`; otherwise return actionable approval or verification recovery
- archive-operation predicates `schema.nameMatch`, `archive.archivable`, `spec.overlap`, and the shared workspace, dependency, implementation, validity, task, and freshness checks required by archive preflight

Validity application and automatic returns occur in the central reconciler before predicates authorize progress. Checks consume its verdict and MUST NOT append invalidation or recovery events themselves. A transition or operation matching multiple applicability bindings SHALL execute each stable check ID at most once. When pre-persist effects may mutate files or links, the caller SHALL reacquire fresh facts and rerun applicable readiness and verification predicates before persistence. Protocol validation always rejects `verifying → verifying`; explicit start and completion are application operations independent of transitions.

`verification.current` SHALL follow the existing check ABI, module/factory conventions, and generic progress bus, with label `Checking verification freshness`. `GetStatus` projects the same predicate without completing an attempt. Shared fingerprint evaluation is pure; application dependencies obtain fresh input facts. Sign-off and archive consume the canonical evidence requirement and freshness verdict. Phase skipping remains deferred; future legitimate skips must distinguish evidence not required from completed valid evidence rather than manufacture a verification record. Compiled transition metadata for future skipped phases SHALL preserve applicable crossed-boundary guards before such a route can be enabled.

Existing compact diagnostic rules remain: implementation-state text reports counts plus at most three labeled examples, full inventories remain structured, and dependency/read-only failures retain their complete small identifier sets.

### Requirement: Actionable fail diagnostics

A failing check’s `message` (and `details` when structured data helps) MUST explain **what differs or what is blocked**, not only **which ids are involved** — **except** `impl.filesResolved` / `impl.linksInScope`, which keep the compact-summary rule above.

- `deps.consistent` — for each mismatched spec, MUST include extracted `dependsOn` and persisted `dependsOn` (empty lists shown explicitly). MUST NOT stop at “disagrees for: \<specId>” alone. `details` SHOULD include per-spec `{ extracted, persisted }` (or equivalent).
- `spec.overlap` — MUST name the overlapping change(s) and overlapping spec id(s) when known.
- `workspace.readOnly` — MUST name the read-only spec ids; SHOULD include workspace name when known.
- `impl.filesResolved` / `impl.linksInScope` — MUST NOT expand the actionable-diagnostics bar into a full inventory in text; compact summary only (see above).
- Other predicates — MUST keep an actionable reason already used by existing typed errors (artifact id, incomplete counts, approval missing, etc.).

`label` orients “which check”; `message`/`details` orient “what to fix” (or, for `impl.*`, “how big the problem is” plus where to list the rest).

`impl.linksInScope` remains skippable with `--allow-out-of-scope` on archive (and MUST use the same skippable semantics when evaluated on `from = implementing` if that override is in scope). `impl.filesResolved` MUST NOT be skippable with that flag. When projecting status or repair blockers from failed checks, `bypassFlag: '--allow-out-of-scope'` (and `isSkippable` for that flag) MUST attach only when the failing check id is `impl.linksInScope` — never solely because `code` is `IMPLEMENTATION_STATE`.

Default **effect** bindings (`hook.pre` / `hook.post`, kind `effect`) for schema `run:` hooks. Each effect’s `execute` SHALL call `RunStepHooks` via constructor deps. Lifecycle use cases MUST NOT call `RunStepHooks` by check id. Each effect binding SHALL declare `phase` and `onFailure`:

- `hook.pre` (transition): `to = *`, `from = *`, `along = *` except `recovery`; `phase = before-persist`; `onFailure = abort`
- `hook.post` (transition): `from = *`, `to = *`, `along = forward` only; `phase = before-persist`; `onFailure = abort`
- `hook.pre` (archive): operation `archive`; `phase = before-persist`; `onFailure = abort`; `RunStepHooks` step `archiving`
- `hook.post` (archive): operation `archive`; `phase = after-persist`; `onFailure = collect`; `RunStepHooks` step `archiving`

Predicates on both tables default to `phase = before-persist` and `onFailure = abort`.

### Requirement: Generic check progress bus

`TransitionChange` and `ArchiveChange` MUST expose a single progress bus for every matching check they execute (predicates and effects). Event kinds:

- `check-start` — `{ id, label }` when a check’s `execute` begins
- `check-progress` — `{ id, label, … }` optional streaming details (stdout/stderr lines, heartbeats, or other check-authored messages)
- `check-done` — `{ id, label, outcome, reason? }` when `execute` finishes (`reason` is the fail `message` when `outcome` is `fail`)

Use cases MUST emit `check-start` before calling `execute` and `check-done` after the result is known (including `skip`). Checks MAY emit `check-progress` through `ctx.onCheckProgress` while running. Hook effects MUST map `RunStepHooks` progress onto `check-progress` / participate in the same `check-start`/`check-done` envelope — they MUST NOT define a separate public hook-only progress contract for CLI rendering.

Text CLI rendering for transition/archive MUST follow:

```text
<label> (<id>)
  …optional check-progress lines…
✓ <label>
# or
✗ <label>: <reason>
```

No `Executing:` prefix. `GetStatus` MUST NOT stream this bus (status is a snapshot); structured check rows MUST include `label`. Blockers projected from failed predicates MUST include that check’s `label` (and SHOULD include `checkId`) so status text/JSON can hint what codes like `DEPS_INCONSISTENT` mean.

Canonical built-in labels (gerund):

| id                        | label                              |
| ------------------------- | ---------------------------------- |
| `protocol.edge`           | Validating transition edge         |
| `workflow.requires`       | Checking required artifacts        |
| `workflow.taskCompletion` | Checking task completion           |
| `deps.consistent`         | Checking spec dependencies         |
| `workspace.readOnly`      | Checking workspace ownership       |
| `impl.filesResolved`      | Checking open implementation files |
| `impl.linksInScope`       | Checking implementation links      |
| `approval.spec`           | Checking spec approval             |
| `approval.signoff`        | Checking signoff approval          |
| `schema.nameMatch`        | Checking schema name               |
| `archive.archivable`      | Checking archivable state          |
| `spec.overlap`            | Checking spec overlap              |
| `hook.pre`                | Running pre hooks                  |
| `hook.post`               | Running post hooks                 |

### Requirement: Projections

`validTransitions` SHALL be protocol-legal targets from the current state.

`availableTransitions` SHALL be those targets whose predicate evaluation is `allowed` (including task completion, enter-ready / exit-implementing, and approval delivery checks).

`nextAction` SHALL be derived only from this evaluation plus change-level review blockers. In `implementing`, when tasks are complete and `verifying` is allowed, `nextAction` MUST recommend `/specd-verify`, not `/specd-implement`. When `approval.spec` fails and the current state is a binding `from` for that check, `nextAction` MUST recommend `specd changes approve spec`, not `/specd-implement` and not a transition to `pending-spec-approval`. When `approval.signoff` fails and the current state is a binding `from` for that check, `nextAction` MUST recommend `specd changes approve signoff`.

Happy-path `nextAction` from `done` / `archivable` SHALL remain archive or signoff-approve. Skill-aligned backward hops MUST appear in `availableTransitions` without becoming that default `nextAction`.

### Requirement: No shared snapshot bag

There SHALL be no ABI type that enumerates all check facts (`PredicateSnapshots` or a closed `needs` union). `GetStatus`, `TransitionChange`, `ArchiveChange`, `ValidateArtifacts`, and `GetArtifactInstruction` MUST NOT gather a global snapshot for all checks. Each check’s `execute` SHALL perform that check’s I/O through its own composed ports, then call that check’s domain `run` with those facts only.

Applicability SHALL be declared **once** (one binding table composed into the application registry). MUST NOT maintain a second copied list of `from`/`to`/`along` rows in domain that can drift from the registry.

Matcher and `classifyAlong` MAY remain domain-pure. `evaluateLifecycleVerdict` SHALL project `validTransitions` / `availableTransitions` / `nextHop` from **predicate** `CheckResult`s supplied by the caller (`checksByTarget`). Application `evaluateLifecycle` attaches `nextAction` (including `command`). It MUST NOT accept a snapshot struct. It MUST NOT fall back to `check.run` against a bag when `checksByTarget` is missing. Use cases MUST NOT launch `RunStepHooks` except by calling matching effect `execute`.

### Requirement: Approval precedence and production registry composition

Transition evaluation for historic parked approval states MUST preserve the approval-required repair contract before protocol-edge rejection of a non-drain target. Production status and archive composition MUST inject the overlap detector into their workflow check registries; a default registry without that injected dependency is permitted only for non-production or isolated use.

## Constraints

- Check results MUST NOT be split into schema/task/platform output arrays; origin is metadata on the check, not the DTO shape.
- `recovery` MUST NOT be treated as `backward`.
- Dry-run (out of this spec’s CLI surface) SHALL use predicates only.
- Listing check ids in schema YAML is forbidden.
- `TransitionChange` MUST NOT rewrite `implementing` to `pending-spec-approval` or `archivable` to `pending-signoff`.
- Effect timing and fail-soft vs fail-fast MUST come from binding `phase` / `onFailure`, not from check id.
- Execute MUST NOT filter matching effects to `hook.pre` / `hook.post` by id; every matching binding for the slot SHALL run.
- Adding a built-in or future plugin check MUST NOT require editing a central snapshot type or the lifecycle use cases’ gather logic.

## Spec Dependencies

- [`core:change`](../change/spec.md) — lifecycle states, approval records, and `VALID_TRANSITIONS`
- [`core:workflow-model`](../workflow-model/spec.md) — `workflow[]` lookup rows, progress axis, requires, taskCompletion, hook declarations
- [`core:schema-format`](../schema-format/spec.md) — workflow step YAML shape
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — domain purity vs application I/O

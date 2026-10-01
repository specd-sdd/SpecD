# Transition Checks

## Purpose

Status, repair guides, and `change transition` currently answer “may this change move from A to B?” with different rules, so agents see available steps that execute would reject. This spec defines the shared evaluation of one transition attempt (and of the archive operation): the check registry attaches reusable checks according to `from` / `to` / `along` (or operation `archive`), each with a kind (predicate vs effect). Projections (`allowed`, `availableTransitions`, `nextAction`) MUST come from that evaluation, not from parallel if-ladders.

Human approval gates are checks on the delivery edge. They MUST NOT be implemented as `change transition` into `pending-spec-approval` or `pending-signoff`. The change stays in `ready` or `done` until `ApproveSpec` / `ApproveSignoff` records consent; then the same delivery edge becomes `allowed`.

## Requirements

### Requirement: Check identity and result

Every check SHALL have a stable identifier. The `CheckId` type MUST be an open `string` rather than a closed union to support dynamic plugin checks alongside built-in core invariants. Built-in check identifiers SHALL NOT contain an `@` prefix (e.g. `protocol.edge`, `workflow.requires`), whereas custom plugin check identifiers SHALL be canonically namespaced as `@${pluginName}.${id}`.

Every check SHALL also declare a mandatory human-readable `label`: a short gerund phrase suitable for UI logs and progress rendering (e.g. `"Checking required artifacts"`).

A check result (`CheckResult`) SHALL include:

- `id`: The canonical check identifier string.
- `label`: Human-readable gerund phrase matching the check definition.
- `kind`: `predicate` or `effect`.
- `outcome`: `pass`, `fail`, or `skip`.
- `code`: Diagnostic error code when `outcome === 'fail'`.
- `message`: Diagnostic message when `outcome === 'fail'`.
- `command`: Optional CLI remediation command suggested to resolve a failure.
- `details`: Optional structured payload (e.g. counts, identifiers, metadata).

The `skip` outcome SHALL originate from exactly two canonical sources:

1. **Check Self-Discard**: A check inspects its `CheckExecutionContext` (such as active schema, step config, or change scope) and determines that its invariant does not apply, returning `{ outcome: 'skip', message: '...' }`.
2. **Orchestrator Bypass (`--skip-checks`)**: The user explicitly requests a bypass for a check whose active binding declares `skippable: true`. The orchestrator skips `check.execute()` and injects a synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }`.

instruction: workflow hooks MUST NOT appear as user-defined checks.

### Requirement: Check ABI create and WorkflowCheck

Every check implementation MUST implement the `Check` domain interface:

```typescript
export interface Check {
  readonly id: string
  readonly label: string
  readonly kind: CheckKind // 'predicate' | 'effect'
  readonly command?: string
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

Bypassability (`skippable: boolean`), disablement governance (`allowDisable: boolean`), and routing policies live on `CheckBindingSpec`, `CheckBinding`, and `WorkflowStepCheckDeclaration`, keeping `Check` strictly focused on invariant evaluation.

The `CheckExecutionContext` passed to `execute` MUST contain strictly contextual evaluation facts:

- `change`: Active change aggregate.
- `schema`: Active workflow schema.
- `attempt`: Transition attempt target (`from`, `to`, `along`).
- `config`: Effective cascading configuration (`Readonly<Record<string, unknown>>`) resolved for this check instance.
- `validity`: Reconciled change validity verdict.
- `onCheckProgress`: Optional callback for streaming diagnostic progress events.

The execution context MUST NOT contain ad-hoc bypass booleans (such as `allowOutOfScope` or `allowOverlap`). Pure check functions SHALL evaluate strictly whether the domain invariant holds.

### Requirement: Public CustomCheckDefinition contract

The public authoring contract for external plugins SHALL be `CustomCheckDefinition`:

```typescript
export interface CustomCheckDefinition {
  readonly id: string
  readonly label: string
  readonly command?: string
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

The public contract MUST NOT expose the engine-internal `kind` property or lifecycle routing bypass flags (`skippable`). The engine automatically sets `kind: 'predicate'` upon registration, while skippability is configured on bindings.

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

The system SHALL maintain explicit governance and skippability permissions across all built-in check bindings in `CheckBindingSpec` and `CheckBinding`:

- **Category A (Protocol & State Invariants)** (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`): MUST explicitly declare `allowBindingOverride: false`, `allowDisable: false`, and `skippable: false`. Cannot be embedded into steps or disabled in `schema.yaml`. Hook effects (`hook.pre`, `hook.post`) are bypassed via `--skip-hooks`, never `--skip-checks`.
- **Category B (Native Step Attributes)** (`workflow.requires`, `workflow.taskCompletion`, `approval.spec`, `approval.signoff`): Governed natively via dedicated step and workspace schema configurations (`requires: []`, `requiresTaskCompletion`, `approvals`). Declares `skippable: false`.
- **Category C (Policy & Consistency Checks)**: Declares `allowBindingOverride: true` and `allowDisable: true`, permitting project schemas to bind them to workflow steps or declaratively disable them (`disabled: true`).
  - `impl.linksInScope`: Declares `skippable: true`. Bypassed via `--skip-checks impl.linksInScope` (or legacy alias `--allow-out-of-scope`).
  - `spec.overlap`: Declares `skippable: true`. Bypassed via `--skip-checks spec.overlap` (or legacy alias `--allow-overlap`).
  - `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`: Declare `skippable: false`. Cannot be bypassed via CLI flag.

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

- [`core:change`](../change/spec.md) — lifecycle states, approval records, and VALID_TRANSITIONS
- [`core:workflow-model`](../workflow-model/spec.md) — workflow\[] lookup rows, progress axis, requires, taskCompletion, hook declarations
- [`core:schema-format`](../schema-format/spec.md) — workflow step YAML shape
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — domain purity vs application I/O
- [`core:check-registry`](../check-registry/spec.md) — Dynamic check resolution, namespacing, and two-tier governance.

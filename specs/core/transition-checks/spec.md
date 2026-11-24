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
- `action`: Optional host-neutral `CheckAction` descriptor (`{ kind, params?, guidance?, supersedesIntent? }`) built by the check at failure time and present only when `outcome === 'fail'`. `action` exists on `CheckResult` only; neither `Check` nor `CustomCheckDefinition` declares a static action.
- `details`: Optional structured payload (e.g. counts, identifiers, metadata).

`CheckResult` MUST NOT embed CLI flags, CLI command strings, or agent slash commands in `action` or `details`.

The `skip` outcome SHALL originate from exactly two canonical sources:

1. **Check Self-Discard**: A check inspects its `CheckExecutionContext` (such as active schema, step config, or change scope) and determines that its invariant does not apply, returning `{ outcome: 'skip', message: '...' }`.
2. **Orchestrator Bypass**: The caller explicitly requests a bypass for a check whose active binding declares `skippable: true` using host-neutral check identifiers. The orchestrator skips `check.execute()` and injects a synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }`.

instruction: workflow hooks MUST NOT appear as user-defined checks.

### Requirement: Check ABI create and WorkflowCheck

Every check implementation MUST implement the `Check` domain interface:

```typescript
export interface Check {
  readonly id: string
  readonly label: string
  readonly kind: CheckKind // 'predicate' | 'effect'
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

A check that wants to tell hosts how to remediate a failure builds a `CheckAction` inside its `execute` (from `ctx.change`, `ctx.config`, and its own findings) and returns it on `CheckResult.action`. The `Check` interface MUST NOT carry a static `action`.

Bypassability (`skippable: boolean`), disablement governance (`allowDisable: boolean`), and routing policies live on `CheckBindingSpec`, `CheckBinding`, and `WorkflowStepCheckDeclaration`, keeping `Check` strictly focused on invariant evaluation.

The `CheckExecutionContext` passed to `execute` MUST contain strictly contextual evaluation facts:

- `change`: Active change aggregate.
- `schema`: Active workflow schema.
- `attempt`: Transition attempt target (`from`, `to`, `along`).
- `config`: Effective cascading configuration (`Readonly<Record<string, unknown>>`) resolved for this check instance.
- `validity`: Reconciled change validity verdict.
- `onCheckProgress`: Optional callback for streaming diagnostic progress events.
- `approvals`: Optional baked approval gate flags (`{ spec, signoff }`), used only by the approval predicates to know whether a gate is enabled.
- `effectiveStatusByArtifact`: Optional per-pass map of effective artifact statuses shared across predicates.
- `skipHookPhases`: Optional hook phases the caller asked to skip, used by hook effects only.
- `passMemo`: Optional per-evaluation-pass memo shared across checks (for example one `CountTasks` run per pass); it MUST live on the context, never on the check instance.

The execution context MUST NOT contain ad-hoc bypass booleans (such as `allowOutOfScope` or `allowOverlap`). Pure check functions SHALL evaluate strictly whether the domain invariant holds.

### Requirement: Public CustomCheckDefinition contract

The public authoring contract for external plugins SHALL be `CustomCheckDefinition`:

```typescript
export interface CustomCheckDefinition {
  readonly id: string
  readonly label: string
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

The public contract MUST NOT expose the engine-internal `kind` property or lifecycle routing bypass flags (`skippable`). The engine automatically sets `kind: 'predicate'` upon registration, while skippability is configured on bindings.

### Requirement: One implementation file per check

Each check id SHALL be implemented in its own module pair as needed (pure rule vs `execute`). The application type SHALL declare `id` and `kind` on the class; `kind` MUST NOT be omitted or inferred from `id`. The check MUST NOT declare applicability (`from` / `to` / `along` or operation `archive`). Shared matcher, `classifyAlong`, and bindings MAY live in sibling modules; they MUST NOT embed another check’s `execute` body.

### Requirement: Applicability from, to, and along

The **check registry** SHALL declare applicability as `from`, `to`, and `along` (wildcards allowed) on bindings that reference a check. The same check object MAY be bound to more than one attempt (for example enter-`ready`, operation `archive`, or intermediate `step-skip`).

`along` SHALL be one of:

- `forward` — `to` is posterior to `from` on the progress axis
- `backward` — `to` is anterior on that axis (retry)
- `redesign` — `to` is `designing`
- `recovery` — archive rollback (`archiving → archivable`)
- `any` — no direction filter

The progress axis and transition classification SHALL be derived directly from `resolveWorkflowPipeline(schema, approvals)`.
Steps explicitly declared `disabled: true` are excluded from the axis.
Fallback insertion MUST NOT revive disabled steps or corrupt retry classification.
Omission of a canonical step from `workflow[]` defaults to enabled.

`from = *` / `to = *` without `along` MUST NOT be used when it would confuse `ready → designing` with `ready → implementing`.

Sugar MAY be used in authoring; the stored contract is the triple:

- `onEnter(S)` → `to = S`, `from = *`, `along = any` unless specified
- `onExit(S, along)` → `from = S`, `to = *`

### Requirement: Step-skip check scope and applicability

The check system SHALL support a dedicated attempt scope for validating whether an intermediate workflow step may be bypassed:

1. **CheckAttempt Extension**:
   - `scope: 'step-skip'` identifies an attempt to bypass an intermediate step `step` during a transition from `from` to `to`.
   - Discriminator: `{ readonly scope: 'step-skip'; readonly step: ChangeState; readonly from: ChangeState; readonly to: ChangeState }`.
2. **CheckApplicability Extension**:
   - `StepSkipApplicability` targets checks bound to bypassed steps: `{ readonly scope: 'step-skip'; readonly step: ChangeState | '*' }`.
   - Matching: `checkMatches` returns `true` if binding scope is `'step-skip'` and binding `step` matches the attempt `step` (or `'*'`).
3. **Isolation**: Checks bound under `scope: 'step-skip'` are evaluated strictly as bypass preconditions and do not collide with destination enter/exit predicates under `scope: 'transition'`.

### Requirement: Dynamic runtime binding composition and cascaded config resolution

When evaluating a candidate transition (`from` -> `to`) or bypassed steps (`listBypassedWorkflowSteps(from, to, schema, approvals)`):

1. **Target Step Transition Bindings**:
   - The active evaluation bindings SHALL dynamically incorporate check declarations from `schema.workflowStep(to).checks`.
   - Declarations with `disabled: true` SHALL exclude the matching check from execution for that transition coordinate.
   - Declarations defining new bindings SHALL synthesize a `CheckBinding` with `scope: 'transition'`, `to`, and `along`.
   - Step configuration SHALL be merged over binding defaults and check defaults using `deepMergeConfig(checkDefault, bindingDefault, stepConfig)`, passing the resolved record into `CheckExecutionContext.config`.
2. **Bypassed Steps Skip Bindings**:
   - For each intermediate bypassed step `S`, the active evaluation bindings SHALL dynamically incorporate skip check declarations from `schema.workflowStep(S).skipChecks`.
   - Declarations with `disabled: true` SHALL exclude the matching skip check from execution.
   - Declarations defining new bindings SHALL synthesize a `CheckBinding` with `scope: 'step-skip'` and `step: S`.
   - Step configuration SHALL be merged using `deepMergeConfig` and passed into `CheckExecutionContext.config`.
3. **Single-pass config cascade**: The effective configuration for each binding SHALL be computed exactly once, in the order check default → binding default → step declaration, and carried on the resolved binding. Predicate execution SHALL pass that resolved record to `CheckExecutionContext.config` unchanged and MUST NOT merge any layer a second time. Merging the same layer twice (for example duplicating array entries) is a defect.
4. **Coordinate isolation**: The `scope: 'transition'` coordinate of a step and the `scope: 'step-skip'` coordinate of the same step are independent bindings. `disabled: true` in `checks` SHALL remove the check only from that step's transition coordinate, and `disabled: true` in `skipChecks` SHALL remove it only from that step's step-skip coordinate. `disabled: true` in `archiveChecks` SHALL remove it only from the `scope: 'archive'` coordinate. Disabling one coordinate MUST NOT remove, reconfigure, or otherwise affect another.
5. **Applicability of step checks**: A check declared in `schema.workflowStep(to).checks` SHALL match a transition attempt only when its `from` (default `'*'`) and `along` (default `'forward'`) match the attempt. Step checks MUST NOT run on backward, redesign, or recovery entries unless their declaration explicitly selects that `along`. This applies equally when the declaration overlays a code-defined binding: the overlaid binding's applicability SHALL be narrowed to the declaration's `from` and `along`, and the rows of the code-defined binding that the declaration does not select SHALL keep their original policy and configuration.
6. **Concrete step-skip coordinates**: When a code-defined `step-skip` binding with `step: '*'` serves a bypassed step that the schema declares in `skipChecks`, the resolved binding for that step SHALL carry the concrete `step` value. A binding resolved for one bypassed step MUST NOT match, or lend its configuration to, a different bypassed step.
7. **Resolver is the single owner**: `resolveEffectiveBindings` SHALL be the only place that applies schema `checks` / `skipChecks` / `archiveChecks` declarations (exclusion through `disabled`, `from` / `along` narrowing, `onFailure`, `skippable`, and configuration). Every declaration SHALL resolve either into a binding or into an exclusion. The predicate runner SHALL execute the resolved bindings as given: it MUST NOT re-filter declarations, re-merge configuration, or execute declarations that are not represented as resolved bindings.
8. **Executable instances**: A binding synthesized for a declaration SHALL reference the executable check instance from the registry handed in by composition (see [`core:check-registry`](../check-registry/spec.md)), so a schema-embedded built-in check evaluates real facts.
9. **Derived policy comes from resolved bindings**: Every consumer that reports or enforces binding policy — failure mapping (`skippable` on `CheckPredicateFailedError`), skipped-check validation (for transitions and for the archive operation), blocker `isSkippable` / `checkId` projection (without embedding CLI `bypassFlag` strings), and `onFailure` handling — SHALL read it from the resolved bindings for the attempt being evaluated, never from the base binding table.
10. **Archive operation bindings**: When the input selects operation `archive`, the resolver SHALL treat the `archiveChecks` of `schema.workflowStep('archiving')` as declarations over bindings with `scope: 'archive'`:
    - Declarations with `disabled: true` SHALL exclude the matching check from the archive operation.
    - Declarations naming a check that no base archive binding serves SHALL synthesize a `CheckBinding` with `scope: 'archive'`, `skippable` taken from the declaration (default `false`), the check's governance from the registry, and the default failure policy.
    - `skippable` and `config` SHALL overlay the base binding at the archive coordinate, subject to the governance locks.
    - `archiveChecks` have no `onFailure`; the base binding's failure policy SHALL be kept.
    - Synthesized archive bindings SHALL be appended after the base bindings, in declaration order.
    - Without a registry, a declaration that names a check no base archive row serves SHALL be dropped, because nothing can be synthesized; declarations that overlay base rows still apply.
    - `operation: 'archive'` is mutually exclusive with `targetStep` and `bypassedSteps`; combining them SHALL throw `InvalidInputError`.
    - The three overlays (`checks`, `skipChecks`, `archiveChecks`) SHALL share one parameterized implementation so cascade, governance, and coordinate-splitting behave identically.

### Requirement: Archive is an operation not an edge

The archive operation SHALL resolve its bindings through `resolveEffectiveBindings` exactly as transitions do, so the schema's `archiveChecks`, the governance locks, and skipped-check-id validation apply uniformly. The archive operation has no `from`, `to`, or `along`; its attempt is `{ scope: 'archive' }`.

### Requirement: Binding pipeline phase and failure policy

Every **effect** binding SHALL declare:

- `phase`: `before-persist` or `after-persist` — which use-case slot runs the effect
- `onFailure`: `abort` or `collect` — abort the operation (`HookFailedError`) or record the failure and continue

The use case SHALL open those slots around persist. It MUST iterate matching bindings for the current slot. It MUST NOT hardcode `hook.pre` / `hook.post` to decide timing, failure policy, skip mapping, or whether to call `execute`. `skipHookPhases` SHALL map to binding `phase` plus skip selectors (`target.pre` / `source.post` / archive `pre`/`post`). `source.pre` and `target.post` MAY be accepted as no-ops until a binding uses those slots.

`before-persist` effects run after predicates pass and before the operation’s persist. `after-persist` effects run after the operation has committed. Transition `hook.post` SHALL remain `before-persist` (it completes the source step before `mutate`). Archive `hook.post` SHALL be `after-persist`.

### Requirement: Predicate versus effect

`predicate` checks SHALL determine `allowed` for status and MUST pass before execute runs effects.

`effect` checks are `run:` hooks. They MUST NOT count toward status `allowed` (unknown until run). Execute SHALL run matching effects after all predicates pass (and, for `after-persist`, after persist). Failure handling SHALL follow binding `onFailure` (`abort` → `HookFailedError` and no persist when still before persist; `collect` → record and continue). Skipping hook phases (`skipHookPhases`) SHALL skip effects only.

The matcher for predicates and effects SHALL be the same (`from` / `to` / `along` or operation `archive`).

Execute MUST select effects by binding `phase` and MUST apply binding `onFailure`. Execute MUST NOT choose slot or fail-soft vs fail-fast by comparing `check.id` to `hook.pre` or `hook.post`.

### Requirement: Evaluation of a transition attempt

For a candidate edge (`from` = current state, `to` = requested target):

1. Classify `along` for the requested pair using `resolveWorkflowPipeline(schema, approvals)`. There is **no** approval routing rewrite: the requested target is the target.
2. Run `protocol.edge` against `listWorkflowTransitions(from, schema, approvals)`. On `TransitionChange` execute, fail-fast if it fails. On `GetStatus`, collect it with every other matching predicate (no fail-fast).
3. For every registered **predicate** whose binding matches the attempt, call `check.execute(ctx)` (schema `workflow.requires` and `workflow.taskCompletion` still use `to` = requested target).
4. Set `allowed` when no blocking predicate failed (`skip` is not a failure).
5. On execute only: for matching **effects** whose binding `phase` matches the current slot, call `check.execute(ctx)`, then persist (or, for `after-persist`, after persist). Apply each binding’s `onFailure`.

`ApproveSpec` / `ApproveSignoff` remain separate commands. They MUST record consent on the change and MUST NOT call `TransitionChange` into a pending state.

### Requirement: Shared transition candidate evaluator

Core SHALL expose one pure application-facing candidate evaluation path that accepts the current change facts, sovereign schema, approval gates, target, registry bindings, and predicate execution context.

The evaluator MUST:

1. compute the target attempt and `listBypassedWorkflowSteps(from, to, schema, approvals)`;
2. evaluate `protocol.edge` first;
3. resolve and evaluate all matching normal transition predicates;
4. for every optional bypassed step, resolve and evaluate its matching `scope: 'step-skip'` predicates in pipeline order;
5. treat an empty effective step-skip set as passing;
6. return the complete ordered check results, bypassed steps, and allowed verdict without executing effects or mutating state.

The evaluator SHALL accept an evaluation mode. In **projection** mode (used by `GetStatus`) every matching predicate is evaluated and collected. In **execute** mode (used by `TransitionChange`) a failing `protocol.edge` SHALL stop evaluation immediately: no other predicate executes and the result carries only the protocol failure.

`GetStatus` and `TransitionChange` MUST both call this evaluator. `TransitionChange` MUST call it against fresh state immediately before running effects and persistence; it MUST NOT reuse a prior status snapshot as authorization.

### Requirement: Shared validity verdict and recovery priority

A pure shared evaluator SHALL derive one canonical verdict from a fresh change snapshot, resolved schema, configured gates and policy, current artifact files, and current confirmed implementation files. The verdict SHALL independently report artifact review, spec approval, sign-off, verification, task completion, current-state validity, blockers, affected inputs, reasons, required recovery, and recommended next action.

Recovery priority SHALL be deterministic:

1. required stale or revoked spec approval in a state after `ready` returns immediately to `designing`; in `ready` no recovery is requested because `approval.spec` blocks leaving `ready` and consent is renewed there (the change stays in `ready` with the `approve-spec` action)
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

- **Category A (Protocol & State Invariants)** (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`): MUST explicitly declare `allowBindingOverride: false`, `allowDisable: false`, and `skippable: false`. Cannot be embedded into steps or disabled in `schema.yaml`. Hook effects (`hook.pre`, `hook.post`) are bypassed only through the hook-phase skip input (`skipHookPhases`), never through skipped check ids.
- **Category B (Native Step Attributes)** (`workflow.requires`, `workflow.taskCompletion`, `workflow.tasksEmpty`, `approval.spec`, `approval.signoff`): Governed natively via dedicated step and workspace schema configurations (`requires: []`, `requiresTaskCompletion`, `approvals`). Declares `skippable: false`.
  - `workflow.tasksEmpty`: Bound under `scope: 'step-skip'` with `step: 'implementing'`. Verifies that `tasks.md` has no incomplete tasks (`incomplete === 0`) or 0 total tasks before skipping implementation.
- **Category C (Policy & Consistency Checks)**: Declares `allowBindingOverride: true` and `allowDisable: true` on its transition and step-skip rows, permitting project schemas to bind them to workflow steps or declaratively disable them (`disabled: true`). The archive rows of `deps.consistent`, `workspace.readOnly`, and `impl.filesResolved` are an exception (below).
  - `impl.linksInScope`: Declares `skippable: true`. Bound under `scope: 'step-skip'` with `step: 'implementing'`; `scope: 'transition'` from `implementing` to `*` along `forward`; `scope: 'transition'` entering `verifying`; `scope: 'operation'` `verification-start`; and `scope: 'archive'`.
  - `impl.filesResolved`: Declares `skippable: false`. Bound on the same coordinates as `impl.linksInScope`.
  - `spec.overlap`: Declares `skippable: true`. Bypassed by naming `spec.overlap` in the skipped check ids (any legacy delivery alias is a host concern).
  - `deps.consistent`, `workspace.readOnly`: Declare `skippable: false`. Bound on transitions to `ready` and on the archive operation. They cannot be bypassed.
- **Archive exception to Category C**: on the archive operation, `workspace.readOnly`, `deps.consistent`, and `impl.filesResolved` are fully locked (`allowBindingOverride: false`, `allowConfigOverride: false`, `allowDisable: false`, `skippable: false`), because `workspace.readOnly` is a security boundary and unresolved implementation or inconsistent dependencies would produce an invalid archive. Their transition rows keep the Category C policy. Only `spec.overlap`, `impl.linksInScope`, and plugin checks are tunable by a schema on archive.

Every built-in `CheckBindingSpec` SHALL declare `allowBindingOverride` and `allowDisable` explicitly with the values of its category above. When a binding (built-in or plugin) omits a governance field, it SHALL inherit the check-level governance value; binding construction MUST NOT substitute a permissive default (such as `allowBindingOverride: true`).

### Requirement: Actionable fail diagnostics

A failing check’s `message` (and `details` when structured data helps) MUST explain **what differs or what is blocked**, not only **which ids are involved** — **except** `impl.filesResolved` / `impl.linksInScope`, which keep the compact-summary rule above.

- `deps.consistent` — for each mismatched spec, MUST include extracted `dependsOn` and persisted `dependsOn` (empty lists shown explicitly). MUST NOT stop at “disagrees for: \<specId>” alone. `details` SHOULD include per-spec `{ extracted, persisted }` (or equivalent).
- `spec.overlap` — MUST name the overlapping change(s) and overlapping spec id(s) when known.
- `workspace.readOnly` — MUST name the read-only spec ids; SHOULD include workspace name when known.
- `impl.filesResolved` / `impl.linksInScope` — MUST NOT expand the actionable-diagnostics bar into a full inventory in text; compact summary only (see above).
- Other predicates — MUST keep an actionable reason already used by existing typed errors (artifact id, incomplete counts, approval missing, etc.).

`label` orients “which check”; `message`/`details` orient “what to fix” (or, for `impl.*`, “how big the problem is” plus where to list the rest).

`impl.linksInScope` remains skippable on archive and, with the same skippable semantics, on `from = implementing`. `impl.filesResolved` MUST NOT be skippable. When projecting status or repair blockers from failed checks, `@specd/core` SHALL attach `checkId` and `label` to every blocker produced from a failed check, and SHALL set `isSkippable` from the resolved binding for the failing check (`true` only when that binding is skippable, otherwise `false`) — never solely because `code` is `IMPLEMENTATION_STATE`. Core MUST NOT embed CLI flags in blockers. Hosts MUST gate any bypass offer on `isSkippable`, not on the presence of `checkId`; delivery adapters project the bypass syntax (flags and legacy aliases) at the presentation boundary.

Default **effect** bindings (`hook.pre` / `hook.post`, kind `effect`) for schema `run:` hooks. Each effect’s `execute` SHALL call `RunStepHooks` via constructor deps. Lifecycle use cases MUST NOT call `RunStepHooks` by check id. Each effect binding SHALL declare `phase` and `onFailure`:

- `hook.pre` (transition): `to = *`, `from = *`, `along = *` except `recovery`; `phase = before-persist`; `onFailure = abort`
- `hook.post` (transition): `from = *`, `to = *`, `along = forward` only; `phase = before-persist`; `onFailure = abort`
- `hook.pre` (archive): operation `archive`; `phase = before-persist`; `onFailure = abort`; `RunStepHooks` step `archiving`
- `hook.post` (archive): operation `archive`; `phase = after-persist`; `onFailure = collect`; `RunStepHooks` step `archiving`

Predicates on both tables default to `phase = before-persist` and `onFailure = abort`.

### Requirement: Host-neutral impl.linksInScope message

When `detectImplLinksInScope` detects confirmed implementation links targeting specs outside `change.specIds`, its failure `message` MUST describe the out-of-scope spec count and compact summary in host-neutral terms. It MUST NOT embed CLI flags (such as `--allow-out-of-scope`), use-case input names (such as `allowOutOfScope`), or any bypass instruction; bypass guidance comes from the resolved binding (`isSkippable` plus `checkId`) rendered by the delivery host. The detection result MUST preserve `outOfScopeSpecIds`.

### Requirement: Check-declared host-neutral actions

When a check fails, it MAY declare an optional `CheckAction` on `CheckResult.action` to tell callers and delivery hosts how to remediate the failure without embedding CLI commands, flags, or agent slash commands:

```typescript
export interface CheckAction {
  readonly kind: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly guidance?: string
  readonly supersedesIntent?: boolean
}
```

- `kind`: Identifier of the action, one explicit identifier per distinct action. Built-in kinds are reserved and typed (`BuiltInCheckActionKind`): `approve-spec`, `approve-signoff`, `start-verification`, `refresh-status`. Plugin kinds SHOULD be namespaced `@${pluginName}.${id}`, mirroring plugin check identifiers. This is a convention for hosts and plugin authors: core does not validate or enforce the namespace and `params` stays an untyped `Record<string, unknown>` for plugin kinds. A host that does not recognize a kind falls back to `guidance`.
- `params`: Optional structured parameters populated by the check from `CheckExecutionContext` (`ctx.change`, `ctx.config`) and its evaluation findings. Built-in kinds have a fixed, typed `params` shape: `start-verification` and `refresh-status` require `{ changeName: string }`; the others take none. Core SHALL export typed factory helpers for the built-in kinds so check authors and tests never hand-build them.
- `guidance`: Optional host-neutral human prose used by a host that has no specialized mapping for `kind`. It MUST NOT embed CLI commands, flags, or agent slash commands.
- `supersedesIntent`: Optional boolean, default `true`. When `true`, the action replaces the workflow-phase intent in `nextAction` (human consent must happen first). When `false` the action refines the phase intent (the remediation is the phase's own in-place work) and `nextAction.intent` keeps its phase value.

`CheckResult.action`, `CheckAction.params`, `CheckAction.guidance`, and `CheckResult.details` MUST NOT embed CLI flags, CLI command strings, or agent slash commands.

As the proof of concept for check-driven remediation (lifecycle guidance holds no rules about these checks):

- `approval.spec` SHALL emit `action: { kind: 'approve-spec' }` when failing with `APPROVAL_REQUIRED` or `APPROVAL_STALE`. Stale or revoked consent in a state after `ready` has already returned the change to `designing` through committed reconciliation; in `ready` reconciliation commits no recovery and the check itself fails the delivery hops bound from `ready`, where renewing consent is a fresh human approval. There is no `redesign-spec` action kind.
- `approval.signoff` SHALL emit `action: { kind: 'approve-signoff' }` when failing with `APPROVAL_REQUIRED` or `APPROVAL_STALE`.
- `verification.current` SHALL emit `action: { kind: 'start-verification', params: { changeName }, supersedesIntent: false }` for `VERIFICATION_REQUIRED`, `VERIFICATION_IN_PROGRESS`, and `VERIFICATION_STALE`, and `action: { kind: 'refresh-status', params: { changeName }, supersedesIntent: false }` for `VERIFICATION_VALIDITY_UNAVAILABLE`, instead of `details.command`.

The existing check bindings are unchanged: `approval.spec` stays bound from `ready` and `approval.signoff` from `done`. No binding is added for legacy `pending-*` states.

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
| `workflow.tasksEmpty`     | Checking empty tasks               |
| `deps.consistent`         | Checking spec dependencies         |
| `workspace.readOnly`      | Checking workspace ownership       |
| `impl.filesResolved`      | Checking open implementation files |
| `impl.linksInScope`       | Checking implementation links      |
| `approval.spec`           | Checking spec approval             |
| `approval.signoff`        | Checking signoff approval          |
| `verification.current`    | Checking verification freshness    |
| `schema.nameMatch`        | Checking schema name               |
| `archive.archivable`      | Checking archivable state          |
| `spec.overlap`            | Checking spec overlap              |
| `hook.pre`                | Running pre hooks                  |
| `hook.post`               | Running post hooks                 |

### Requirement: Projections

`validTransitions` SHALL be protocol-legal targets from the current state.

`availableTransitions` SHALL be those targets whose predicate evaluation is `allowed` (including task completion, enter-ready / exit-implementing, and approval delivery checks).

`nextAction` SHALL be derived only from this evaluation plus change-level review blockers, as a host-neutral `intent` (`design | implement | verify | archive`) and an optional check-declared `action`. In `implementing`, when tasks are complete and `verifying` is allowed, `nextAction.intent` MUST be `'verify'`, not `'implement'`. When `approval.spec` fails with `APPROVAL_REQUIRED` and the current state is a binding `from` for that check, `nextAction.action` MUST be `{ kind: 'approve-spec' }` and `nextAction.intent` MUST be `null`, not a transition to `pending-spec-approval` and not `'implement'`. When `approval.spec` fails with `APPROVAL_STALE` at a binding `from` state, `nextAction.action` MUST also be `{ kind: 'approve-spec' }` with `nextAction.intent` equal to `null`. When `approval.signoff` fails and the current state is a binding `from` for that check, `nextAction.action` MUST be `{ kind: 'approve-signoff' }`. Delivery hosts render these as commands.

Happy-path `nextAction` from `done` / `archivable` SHALL remain `intent: 'archive'` or the sign-off approval action. Skill-aligned backward hops MUST appear in `availableTransitions` without becoming that default `nextAction`.

For a change in `archivable`, blockers produced by archive predicates SHALL carry `checkId` and `label`, SHALL carry `isSkippable: true` when the resolved archive binding for that check is skippable, and SHALL carry no CLI `bypassFlag` string. A blocker whose resolved binding is not skippable (for example a built-in locked check, or `spec.overlap` made non-skippable by the schema) SHALL carry `isSkippable: false`. The check id SHALL be exactly what `ArchiveChange` accepts in its skipped-check input (`skipChecks`; `skippedCheckIds` on the lifecycle verdict input); delivery hosts project it into their own bypass syntax.

### Requirement: No shared snapshot bag

Applicability SHALL be declared **once** (one binding table composed into the application registry). MUST NOT maintain a second copied list of `from`/`to`/`along` rows in domain that can drift from the registry.

Matcher and `classifyAlong` MAY remain domain-pure. `evaluateLifecycleVerdict` SHALL project `validTransitions` / `availableTransitions` / `nextHop` from **predicate** `CheckResult`s supplied by the caller (`checksByTarget`). Application `evaluateLifecycle` attaches `nextAction` (including host-neutral `intent` and optional `action`). It MUST NOT accept a snapshot struct. It MUST NOT fall back to `check.run` against a bag when `checksByTarget` is missing. Use cases MUST NOT launch `RunStepHooks` except by calling matching effect `execute`.

### Requirement: Approval precedence and production registry composition

Transition evaluation for a change in any state from which an approval predicate is bound (including legacy parking states) MUST report that approval failure through the same predicate path as any other check. Core code MUST NOT keep a separate, hardcoded approval rule for parked states. Production status and archive composition MUST inject the overlap detector into their workflow check registries; a default registry without that injected dependency is permitted only for non-production or isolated use.

### Requirement: Approval bindings cover legacy parking sources

The single binding table SHALL declare `approval.spec` applicability for transitions with `to: '*'` and `along: 'forward'` from each of `ready`, `pending-spec-approval`, and `spec-approved`. It SHALL declare `approval.signoff` applicability for transitions to `archivable` along `forward` from each of `done`, `pending-signoff`, and `signed-off`. These rows exist so that a historic change cannot leave a parking state without the consent its gate requires.

A hop from a parking state toward its delivery edge SHALL classify as `forward`, and a hop to `designing` as `redesign`, so the bound rows match exactly the exits that move the change onward. `boundFromStates('approval.spec')` and `boundFromStates('approval.signoff')` SHALL reflect these rows. No Core code outside the binding table MAY name the parking states to apply an approval rule; removing the parking states removes their rows.

### Requirement: Verification currency bounds every verification-requiring exit

The single binding table SHALL declare `verification.current` applicability for transitions along `forward` from `verifying` to `done`, and for transitions to `archivable` along `forward` from each of `done`, `pending-signoff`, and `signed-off`, in addition to its existing `archive` scope binding. The check keeps `skippable: false`, `allowBindingOverride: false`, and `allowDisable: false`, and it still reports `skip` when the change schema disables `verifying`.

Stale, absent, or in-progress verification therefore makes the check fail on every exit that requires current evidence, so that `availableTransitions` omits those targets and the recommendation stays in the current state with the check-declared `start-verification` action. Core MUST NOT express this rule anywhere else (no hold in lifecycle verdict or guidance code): the check is the single owner of "verification must be current to leave this state".

### Requirement: Check failures carry their own structured details

A failing `CheckResult` MUST carry everything a host needs to describe the failure: a stable `code`, a host-neutral `message`, the optional `action`, and `details` shaped by the contract below. The use cases MUST NOT recompute or reshape these values to select a different error class; they report them through `CheckPredicateFailedError` (see [`core:transition-change`](../transition-change/spec.md) and [`core:archive-change`](../archive-change/spec.md)). Details MUST contain only host-neutral data (no CLI flags or commands).

| Check                                | `details`                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `protocol.edge`                      | `{ from, to }`                                                                                                                                                                |
| `workflow.requires`                  | `{ artifactId, status?, blockedBy?: { artifactId, status } }`, with `blockedBy` computed by the check from the artifact DAG when `status` is `pending-parent-artifact-review` |
| `workflow.taskCompletion`            | `{ artifactId, incomplete, complete, total }`, or `{ artifactId, reason: 'missing-task-capability' }`                                                                         |
| `approval.spec` / `approval.signoff` | `{ gate: 'spec'                                                                                                                                                               | 'signoff' }` |
| `impl.filesResolved`                 | `{ files: string[] }`                                                                                                                                                         |
| `impl.linksInScope`                  | the out-of-scope sidecar updates that would occur                                                                                                                             |
| `deps.consistent`                    | `{ mismatches: [{ specId, extracted, persisted }] }` listing every mismatch                                                                                                   |
| `spec.overlap`                       | `{ entries: [{ specId, changes: [{ name, state }] }] }` listing every overlapping spec and its peer changes                                                                   |
| `workspace.readOnly`                 | `{ specs: [{ specId, workspace }] }` listing every affected spec                                                                                                              |
| `schema.nameMatch`                   | `{ changeName, changeSchemaName, schemaName }`                                                                                                                                |

`details` MAY carry additional host-neutral keys beyond those listed (for example `byArtifact`, `specIds`, `peers`); hosts MUST rely only on the keys in the table. `spec.overlap` omits `entries` when no overlapping entries are known. `workspace.readOnly` reports `'(unknown)'` as the workspace when it cannot be resolved. `approval.signoff` may also fail with `VERIFICATION_*` codes, which carry no `action`; the `approve-signoff` action is declared only for `APPROVAL_*` codes.

Checks MUST compute all of these themselves from their facts. A use case MAY supply data to a check only through the check's facts, never by post-processing the failure.

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

- [`core:change`](../change/spec.md) — lifecycle states, approval records, and state transitions
- [`core:workflow-model`](../workflow-model/spec.md) — workflow\[] lookup rows, progress axis, requires, taskCompletion, hook declarations
- [`core:workflow-topology`](../workflow-topology/spec.md) — ordered pipeline, dynamic legal transitions, and bypassed step calculation
- [`core:schema-format`](../schema-format/spec.md) — workflow step YAML shape
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — domain purity vs application I/O
- [`core:check-registry`](../check-registry/spec.md) — dynamic check resolution, namespacing, and two-tier governance
- [`core:archive-change`](../archive-change/spec.md) — archive operation binding resolution and skipped-check validation
- [`core:get-status`](../get-status/spec.md) — archive predicate evaluation and blocker `isSkippable` / `checkId` projection in `archivable`

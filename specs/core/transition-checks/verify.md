# Verification: Transition Checks

## Requirements

### Requirement: Check identity and result

#### Scenario: Check result carries remediation command

- **GIVEN** a check returning `outcome: 'fail'` with `command: 'pnpm audit:fix'`
- **WHEN** evaluating check results
- **THEN** the `CheckResult` preserves the `command` string for CLI reporting

#### Scenario: Check with skippable binding bypassed by user injects synthetic skip

- **GIVEN** a transition step whose binding declares `skippable: true`
- **WHEN** the user supplies its check ID to `--skip-checks`
- **THEN** the check is not executed
- **AND** a synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }` is recorded

#### Scenario: Self-discarding check returns skip outcome

- **GIVEN** a check whose preconditions do not match active change scope
- **WHEN** `check.execute(ctx)` runs
- **THEN** it returns `{ outcome: 'skip', message: 'Not applicable to current workspace' }`

### Requirement: Check ABI create and WorkflowCheck

#### Scenario: Factory returns WorkflowCheck-compatible instance

- **WHEN** `createWorkflowTaskCompletion({ countTasks })` is called
- **THEN** the result has `id` `workflow.taskCompletion`
- **AND** `kind` is `predicate`
- **AND** `execute` is a function
- **AND** the instance is compatible with `WorkflowCheck`

#### Scenario: Execute does not take a global snapshot bag

- **WHEN** `execute` is invoked
- **THEN** its argument is `CheckExecutionContext` (change, schema, attempt, baked `approvals`, resolved `config`, `skipChecks`, and `checkRegistry`)
- **AND** it does not accept `PredicateSnapshots`

#### Scenario: CountTasks memo lives on passMemo not the check instance

- **GIVEN** one `createWorkflowTaskCompletion` instance used across two evaluation passes
- **WHEN** each pass creates a fresh `passMemo` on `CheckExecutionContext`
- **THEN** `CountTasks` may run at most once per pass
- **AND** the second pass recounts even if the instance is the same

### Requirement: Public CustomCheckDefinition contract

#### Scenario: Public check definition omits kind property

- **GIVEN** an author implementing `CustomCheckDefinition`
- **WHEN** compiling the TypeScript definition without `kind`
- **THEN** type checking succeeds and passes to `registry.register`

#### Scenario: Executing custom check receives isolated config

- **GIVEN** a custom check registered with effective config `{ severity: 'high' }`
- **WHEN** the orchestrator evaluates the check
- **THEN** `ctx.config` contains `{ severity: 'high' }`

### Requirement: One implementation file per check

#### Scenario: Each check id has a dedicated module

- **WHEN** the checks package is inspected
- **THEN** each registered check id is defined in its own implementation file
- **AND** that check’s class declares `id` and `kind`
- **AND** `kind` is `'predicate'` or `'effect'` (never omitted)
- **AND** a `create*` factory returns a `Check` compatible with `WorkflowCheck`
- **AND** that file does not declare applicability
- **AND** registry bindings declare `from` / `to` / `along` or operation `archive` for every attached check, including archive-only ones
- **AND** no check’s `execute` body lives inside another check’s file

### Requirement: Applicability from, to, and along

#### Scenario: Spec approval does not apply to redesign

- **GIVEN** `approval.spec` bound as `from = ready`, `to = *`, `along = forward`
- **AND** the spec gate is on
- **WHEN** the attempt is `ready → designing`
- **THEN** `along` is `redesign`
- **AND** `approval.spec` does not match

#### Scenario: Recovery is not backward

- **WHEN** the attempt is `archiving → archivable`
- **THEN** `along` is `recovery`
- **AND** it is not classified as `backward`

#### Scenario: Disabled steps are excluded from progress axis

- **GIVEN** a schema where `verifying` is `disabled: true`
- **WHEN** evaluating direction from `implementing` to `done`
- **THEN** `along` is classified as `forward`
- **AND** `verifying` does not participate in axis ordering

#### Scenario: Direction delegates to the authoritative topology axis

- **GIVEN** a noncanonical declared workflow order and an explicit approval snapshot
- **WHEN** `classifyAlong` evaluates a transition
- **THEN** it obtains the axis from `resolveWorkflowPipeline(schema, approvals)`
- **AND** no parallel fallback axis is constructed locally

#### Scenario: Omitted implementing keeps retry backward

- **GIVEN** `workflow[]` omits `implementing`
- **WHEN** the attempt is `verifying → implementing`
- **THEN** `along` is `backward`

#### Scenario: Omitted ready stays forward into implementing

- **GIVEN** `workflow[]` lists `designing`, `implementing`, `verifying` and omits `ready`
- **WHEN** the attempt is `ready → implementing`
- **THEN** `along` is `forward`

### Requirement: Step-skip check scope and applicability

#### Scenario: Step-skip checks match attempt step

- **GIVEN** a check bound with `{ scope: 'step-skip', step: 'implementing' }`
- **WHEN** evaluating an attempt with `{ scope: 'step-skip', step: 'implementing', from: 'ready', to: 'verifying' }`
- **THEN** `checkMatches` returns `true`

#### Scenario: Step-skip checks do not match different step

- **GIVEN** a check bound with `{ scope: 'step-skip', step: 'implementing' }`
- **WHEN** evaluating an attempt with `{ scope: 'step-skip', step: 'verifying', from: 'implementing', to: 'done' }`
- **THEN** `checkMatches` returns `false`

### Requirement: Dynamic runtime binding composition and cascaded config resolution

#### Scenario: Target step incorporates schema-declared checks with step-level config

- **GIVEN** a schema workflow step `implementing` declaring a custom check `@security.code-scan` with `config: { severity: 'critical' }`
- **WHEN** `resolveEffectiveBindings` resolves bindings for target step `implementing`
- **THEN** a transition binding for `@security.code-scan` is synthesized
- **AND** the check receives `{ severity: 'critical' }` in `ctx.config`

#### Scenario: Schema disabled check is omitted from matching execution

- **GIVEN** a schema workflow step declaring `impl.linksInScope: { disabled: true }`
- **WHEN** `resolveEffectiveBindings` resolves bindings for that step
- **THEN** `impl.linksInScope` is excluded from the active evaluation list

#### Scenario: Bypassed step incorporates schema-declared skipChecks

- **GIVEN** a schema workflow step `implementing` declaring a skip check `@qa.verify-clean`
- **WHEN** `resolveEffectiveBindings` resolves step-skip bindings for bypassed step `implementing`
- **THEN** a step-skip binding for `@qa.verify-clean` is synthesized under `scope: 'step-skip'`

#### Scenario: Synthesized bindings preserve restrictive governance

- **GIVEN** a registered check whose governance sets `allowBindingOverride`, `allowConfigOverride`, and `allowDisable` to false
- **WHEN** `resolveEffectiveBindings` synthesizes a transition or step-skip coordinate for it
- **THEN** all three effective lock values remain false
- **AND** no synthesized binding relaxes registry governance

#### Scenario: Cascaded config resolution deep merges check, binding, and step configs

- **GIVEN** a check with `defaultConfig: { timeout: 1000, tags: ['a'] }`
- **AND** a binding with `config: { timeout: 2000, tags: ['b'] }`
- **AND** a schema step check with `config: { retries: 3 }`
- **WHEN** the binding is resolved by `resolveEffectiveBindings` and then executed by the predicate runner (the real end-to-end path, not the runner alone)
- **THEN** `ctx.config` contains exactly `{ timeout: 2000, tags: ['a', 'b'], retries: 3 }`
- **AND** no array entry is duplicated (for example `tags` is not `['a', 'b', 'a', 'b']`)

#### Scenario: Disabling a step check leaves its skip check intact

- **GIVEN** an optional step `implementing` whose `checks` declares `impl.linksInScope` with `disabled: true`
- **AND** whose `skipChecks` declares `impl.linksInScope` enabled
- **WHEN** a transition enters `implementing` and, separately, a transition bypasses it
- **THEN** `impl.linksInScope` does not run on the transition entering `implementing`
- **AND** it runs as a `step-skip` predicate when `implementing` is bypassed

#### Scenario: Disabling a skip check leaves the step check intact

- **GIVEN** an optional step whose `skipChecks` disables a Category C check that its `checks` keeps enabled
- **WHEN** a transition enters the step
- **THEN** the check still runs on that transition coordinate

#### Scenario: Step checks ignore non-matching along and from

- **GIVEN** a step `verifying` declaring a check with default `along: forward` and `from: '*'`
- **AND** another check on the same step declaring `from: 'implementing'`
- **WHEN** the attempts `done → verifying` (backward), `ready → verifying` (forward shortcut), and `implementing → verifying` are evaluated
- **THEN** neither check runs on `done → verifying`
- **AND** only the first check runs on `ready → verifying`
- **AND** both checks run on `implementing → verifying`

#### Scenario: Overlay of a default-bound check honors the declaration's from and along

- **GIVEN** `verifying.checks` declares `impl.linksInScope` (which has a code-defined binding entering `verifying`) with `config: { strict: true }` and default `along: forward`
- **WHEN** the attempts `done → verifying` (backward), `ready → verifying` (forward shortcut), and `implementing → verifying` are resolved and executed
- **THEN** the step-configured binding does not run on `done → verifying`
- **AND** it runs with `{ strict: true }` on both forward attempts

#### Scenario: Wildcard step-skip row is narrowed per bypassed step

- **GIVEN** a plugin check registered with a default `step-skip` binding for `step: '*'`
- **AND** `implementing` and `verifying` are optional and each declares that check in `skipChecks` with a different `config`
- **WHEN** a shortcut `ready → done` bypasses both steps
- **THEN** each step-skip attempt runs the check once with its own step's configuration
- **AND** the binding resolved for `implementing` does not match the `verifying` attempt

#### Scenario: Predicate runner executes only resolved bindings

- **GIVEN** a step declaration for a check whose code-defined row is claimed by an overlay that does not match the current attempt
- **WHEN** the predicate runner evaluates that attempt
- **THEN** the check does not run through any fallback path
- **AND** the runner performs no `disabled` filtering or configuration merging of its own

#### Scenario: Synthesized binding uses the executable instance

- **GIVEN** a schema embedding `deps.consistent` on a step where no code-defined binding serves it
- **WHEN** `resolveEffectiveBindings` synthesizes the binding with the composition registry
- **THEN** the binding's check is the application implementation that reads real facts

#### Scenario: Derived policy is read from resolved bindings

- **GIVEN** a schema declaration that sets `skippable: true` for a Category C check whose code-defined binding is non-skippable and permits overrides
- **WHEN** the check fails in `TransitionChange` and in `GetStatus`
- **THEN** `CheckPredicateFailedError.skippable` is `true`, `--skip-checks <checkId>` is accepted, and the status blocker advertises `--skip-checks <checkId>`

#### Scenario: archiveChecks disabled removes the check from the archive operation only

- **GIVEN** `spec.overlap` base-bound to `archive` and the `archiving` entry declares `archiveChecks: [{ id: spec.overlap, disabled: true }]`
- **WHEN** bindings are resolved with operation `archive`
- **THEN** no `spec.overlap` binding is in the effective set
- **AND** resolving a transition into any step is unaffected

#### Scenario: archiveChecks skippable overlays the base binding

- **GIVEN** `deps.consistent` is not skippable at the base and the entry declares `skippable: true`
- **WHEN** bindings are resolved with operation `archive`
- **THEN** the effective `deps.consistent` binding is skippable only where the lock permits
- **AND** where `allowBindingOverride` is `false` the declaration was already rejected at build

#### Scenario: Embedded plugin check synthesizes an archive binding

- **GIVEN** a registered check no base archive binding serves and an `archiveChecks` entry naming it with `skippable: true`
- **WHEN** bindings are resolved with operation `archive`
- **THEN** a binding with `scope: 'archive'` and `skippable: true` is synthesized from the registry's real check instance

#### Scenario: Synthesized archive binding defaults to non-skippable

- **GIVEN** an `archiveChecks` entry without `skippable`
- **WHEN** bindings are resolved
- **THEN** the synthesized binding is not skippable

#### Scenario: archiveChecks keep the base failure policy

- **GIVEN** a base archive binding with its own failure policy
- **WHEN** an `archiveChecks` entry overlays `config`
- **THEN** the effective binding keeps the base `onFailure`

#### Scenario: Config cascade applies once on archive

- **GIVEN** check default config, binding config, and `archiveChecks[].config` with array values
- **WHEN** bindings are resolved with operation `archive`
- **THEN** the effective config is merged exactly once in order check default, binding, declaration

#### Scenario: Declaration for an unserved check is dropped without a registry

- **GIVEN** `archiveChecks` names a registered check no base archive binding serves
- **WHEN** bindings are resolved with operation `archive` and no registry
- **THEN** no binding is synthesized and no error is raised
- **AND** declarations that overlay base archive bindings still apply

#### Scenario: Archive operation cannot be combined with a transition

- **WHEN** bindings are resolved with operation `archive` and also a `targetStep` or `bypassedSteps`
- **THEN** `InvalidInputError` is thrown

#### Scenario: Schema without archiveChecks leaves the base bindings unchanged

- **GIVEN** no `archiving` entry or an entry without `archiveChecks`
- **WHEN** bindings are resolved with operation `archive`
- **THEN** the result equals the base bindings with only cascaded config applied

#### Scenario: Disabling a check with no base archive binding is inert

- **GIVEN** `archiveChecks: [{ id: '@qa.extended-lint', disabled: true }]` for a registered check with no archive binding
- **WHEN** bindings are resolved with operation `archive`
- **THEN** no binding is added and no error is raised

#### Scenario: Synthesized archive bindings follow declaration order

- **GIVEN** two embedded checks declared in the order `@a.lint`, `@b.scan`
- **WHEN** bindings are resolved with operation `archive`
- **THEN** both are appended after the base bindings, `@a.lint` first

#### Scenario: archiveChecks and checks on the archiving entry are independent

- **GIVEN** the `archiving` entry declares `checks: [{ id: deps.consistent }]` and `archiveChecks: [{ id: deps.consistent }]`
- **WHEN** a transition into `archiving` and the archive operation are resolved
- **THEN** each coordinate receives only its own declaration
- **AND** no duplicate-binding error is raised

#### Scenario: A redundant declaration keeps the base policy

- **GIVEN** `archiveChecks: [{ id: workspace.readOnly, skippable: false }]`
- **WHEN** bindings are resolved with operation `archive`
- **THEN** the effective binding keeps `skippable: false` and its governance locks

### Requirement: Archive is an operation not an edge

#### Scenario: Signoff is not an archive predicate

- **WHEN** `ArchiveChange` evaluates operation `archive`
- **THEN** `approval.signoff` is not in the attached predicate list

#### Scenario: Archive resolves through the same resolver as transitions

- **WHEN** `ArchiveChange` prepares its checks
- **THEN** it calls `resolveEffectiveBindings` with operation `archive` and the registry
- **AND** the attempt it evaluates is `{ scope: 'archive' }` with no `from`, `to`, or `along`

### Requirement: Binding pipeline phase and failure policy

#### Scenario: Archive post runs after persist because of phase

- **GIVEN** archive `hook.post` bound with `phase = after-persist` and `onFailure = collect`
- **WHEN** `ArchiveChange` executes and publication succeeds
- **THEN** that effect runs after `archiveRepository.archive()`
- **AND** `ArchiveChange` does not select it by `check.id === 'hook.post'`

#### Scenario: Archive pre abort comes from onFailure

- **GIVEN** archive `hook.pre` bound with `phase = before-persist` and `onFailure = abort`
- **AND** the effect fails
- **WHEN** `ArchiveChange` executes
- **THEN** persist does not occur
- **AND** the failure is not collected as `postHookFailures`

### Requirement: Predicate versus effect

#### Scenario: Status allowed ignores effects

- **GIVEN** matching `run:` post-hooks exist for a forward exit
- **WHEN** `GetStatus` evaluates the same edge
- **THEN** `allowed` does not wait on those hooks

#### Scenario: Skip-hooks still runs predicates

- **GIVEN** `skipHookPhases` contains `all`
- **AND** `workflow.taskCompletion` would fail
- **WHEN** `TransitionChange` executes
- **THEN** the transition is still rejected for incomplete tasks
- **AND** no `run:` hook is invoked

### Requirement: Evaluation of a transition attempt

#### Scenario: Protocol fails fast before other predicates

- **GIVEN** a requested pair not in `listWorkflowTransitions(from, schema, approvals)`
- **AND** other matching predicates that would also fail
- **WHEN** `TransitionChange` evaluates the attempt (execute mode)
- **THEN** `protocol.edge` fails first with `INVALID_TRANSITION`
- **AND** no other predicate's `execute` is called
- **AND** the thrown error is `InvalidStateTransitionError` with reason `invalid-transition`

#### Scenario: Status collects every predicate for an illegal edge

- **GIVEN** the same illegal pair
- **WHEN** `GetStatus` evaluates it (projection mode)
- **THEN** `protocol.edge` and every other matching predicate result are collected

#### Scenario: No routing to pending

- **GIVEN** spec gate on and no spec approval recorded
- **AND** the change is in `ready`
- **WHEN** `TransitionChange` is invoked with `to: 'implementing'`
- **THEN** the change remains in `ready`
- **AND** `approval.spec` fails with `APPROVAL_REQUIRED`
- **AND** the persisted state is not `pending-spec-approval`

### Requirement: Shared transition candidate evaluator

#### Scenario: Candidate combines target and bypass predicates

- **GIVEN** a protocol-legal shortcut over an optional step
- **WHEN** the shared candidate evaluator runs
- **THEN** it evaluates every normal target predicate
- **AND** it evaluates every effective `step-skip` predicate for every bypassed optional step

#### Scenario: Failed step-skip predicate rejects candidate

- **GIVEN** all normal target predicates pass
- **AND** one effective `step-skip` predicate fails
- **WHEN** the shared candidate evaluator returns its verdict
- **THEN** the candidate is not allowed

#### Scenario: Empty effective skip set passes

- **GIVEN** a bypassed optional step has no effective `step-skip` predicates
- **WHEN** the shared candidate evaluator runs
- **THEN** that step contributes no failure and the bypass remains allowed

#### Scenario: Candidate evaluation is pure and shared

- **WHEN** `GetStatus` projects a candidate and `TransitionChange` later attempts it
- **THEN** both use the same evaluator contract
- **AND** evaluation itself performs no effects, hooks, mutation, or persistence
- **AND** `TransitionChange` recalculates the candidate from fresh persisted state

### Requirement: Shared validity verdict and recovery priority

#### Scenario: Identical facts produce identical recovery

- **GIVEN** the same fresh change, schema, gates, policy, artifacts, and implementation files
- **WHEN** status, validation, transition, and archive evaluate validity
- **THEN** each receives the same blockers, affected inputs, recovery priority, and next action

#### Scenario: Verification staleness blocks without moving lifecycle

- **GIVEN** stale verification at a boundary that requires current evidence
- **WHEN** validity is evaluated
- **THEN** progress is blocked with in-place verification guidance
- **AND** no verification-driven lifecycle return is selected

### Requirement: Single validity reconciliation owner

#### Scenario: Repeated observation is idempotent

- **GIVEN** reconciliation already persisted projection changes and required recovery
- **WHEN** another entry point reconciles unchanged facts
- **THEN** it appends no duplicate invalidation or transition events
- **AND** returns the same canonical verdict

#### Scenario: Missing reconciler never selects a legacy path

- **WHEN** a mutating use case is constructed without the required reconciler
- **THEN** construction or execution fails with the typed configuration error
- **AND** `Change.invalidate` is not invoked as a fallback

### Requirement: Registry bindings for this capability

#### Scenario: impl.linksInScope step binding is explicitly skippable

- **GIVEN** the standard workflow step binding for `impl.linksInScope`
- **WHEN** inspecting the binding's `skippable` property
- **THEN** `skippable` is true

#### Scenario: spec.overlap step binding is explicitly skippable

- **GIVEN** the standard archive check binding for `spec.overlap`
- **WHEN** inspecting the binding's `skippable` property
- **THEN** `skippable` is true

#### Scenario: workflow.tasksEmpty step-skip binding is non-skippable

- **GIVEN** the standard step-skip binding for `workflow.tasksEmpty` on step `implementing`
- **WHEN** inspecting the binding's `skippable` property
- **THEN** `skippable` is false

#### Scenario: impl.filesResolved step-skip binding is non-skippable

- **GIVEN** the standard step-skip binding for `impl.filesResolved` on step `implementing`
- **WHEN** inspecting the binding's `skippable` property
- **THEN** `skippable` is false

#### Scenario: Category C checks can be disabled or skippable per schema binding

- **GIVEN** built-in checks `impl.linksInScope` and `impl.filesResolved`
- **WHEN** inspecting their registered governance locks in `TRANSITION_BINDING_SPECS`
- **THEN** both declare `allowBindingOverride: true` and `allowDisable: true`

#### Scenario: Built-in binding specs declare governance explicitly

- **WHEN** every entry of `TRANSITION_BINDING_SPECS`, `ARCHIVE_BINDING_SPECS`, and the built-in step-skip binding specs is inspected
- **THEN** each declares `allowBindingOverride` and `allowDisable` explicitly with its category's values
- **AND** Category A and B bindings declare both as `false`

#### Scenario: Omitted binding governance inherits check-level governance

- **GIVEN** a plugin check registered with `allowBindingOverride: false` whose default binding omits `allowBindingOverride`
- **WHEN** the binding is constructed
- **THEN** the binding's effective `allowBindingOverride` is `false`, not a permissive default

### Requirement: Projections

#### Scenario: Incomplete tasks hide verifying from availableTransitions

- **GIVEN** a change in `implementing` with incomplete `tasks` items
- **WHEN** `GetStatus` runs
- **THEN** `validTransitions` still includes `verifying`
- **AND** `availableTransitions` does not include `verifying`
- **AND** `nextAction` still recommends `/specd-implement`

#### Scenario: Complete tasks recommend verify skill

- **GIVEN** a change in `implementing` with all gated tasks complete
- **AND** `workflow.requires` for `verifying` is satisfied
- **WHEN** `GetStatus` runs
- **THEN** `availableTransitions` includes `verifying`
- **AND** `nextAction` recommends `/specd-verify` not `/specd-implement`

#### Scenario: Failed spec gate recommends approve not pending

- **GIVEN** a change in `ready` with spec gate on and no spec approval
- **WHEN** `GetStatus` runs
- **THEN** `nextAction` recommends `specd changes approve spec`
- **AND** it does not recommend a transition to `pending-spec-approval`

#### Scenario: Backward hops listed but not happy-path nextAction

- **GIVEN** a change in `done`
- **WHEN** `GetStatus` runs
- **THEN** `availableTransitions` includes `implementing` and `verifying`
- **AND** `nextAction` recommends archive or signoff-approve, not the implement skill

#### Scenario: Archive blocker carries bypassFlag only for skippable bindings

- **GIVEN** a change in `archivable` blocked by `spec.overlap` whose resolved binding is skippable
- **WHEN** `GetStatus` projects blockers
- **THEN** the blocker has `bypassFlag` `--skip-checks spec.overlap`

#### Scenario: Locked or schema-hardened archive blocker has no bypassFlag

- **GIVEN** a blocker from `workspace.readOnly`, or from `spec.overlap` with `skippable: false` in the schema
- **WHEN** `GetStatus` projects blockers
- **THEN** the blocker carries no `bypassFlag`

### Requirement: No shared snapshot bag

#### Scenario: Task completion gathers inside its own execute

- **GIVEN** `workflow.taskCompletion` is composed with `CountTasks`
- **WHEN** its `execute` runs for a transition attempt
- **THEN** that instance calls `CountTasks`
- **AND** `GetStatus` does not pass a `PredicateSnapshots` bag into the check
- **AND** no `PredicateSnapshots` type exists in the public or domain ABI
- **AND** `gatherPredicateSnapshots` does not exist
- **AND** `evaluateLifecycleVerdict` does not fall back to `check.run` against a bag

#### Scenario: Archive registry does not bind publication

- **WHEN** operation `archive` bindings are inspected
- **THEN** `archive.publication` is not registered
- **AND** merge/publish preflight remains in `ArchiveChange` after predicates pass

#### Scenario: One binding table

- **WHEN** transition and archive applicability is inspected
- **THEN** `from` / `to` / `along` (and operation `archive`) are declared once
- **AND** domain and application registries do not copy independent row lists

#### Scenario: TransitionChange does not launch hooks by id

- **GIVEN** matching `hook.pre` / `hook.post` bindings
- **WHEN** `TransitionChange` executes
- **THEN** it calls `check.execute` on matching effects
- **AND** it does not branch on `check.id === 'hook.pre'` to invoke `RunStepHooks`

### Requirement: Actionable fail diagnostics

#### Scenario: deps.consistent fail shows extracted versus persisted

- **GIVEN** extracted `dependsOn` for a spec is `[]` and persisted is `['cli:entrypoint', 'core:change']`
- **WHEN** `deps.consistent` fails
- **THEN** `message` includes both the empty extracted list and the persisted ids
- **AND** `details` includes per-spec extracted and persisted arrays

#### Scenario: impl fail text stays a compact summary

- **GIVEN** `impl.filesResolved` or `impl.linksInScope` fails with more than three items
- **WHEN** the fail `message` is rendered for text status / repair / transition failure
- **THEN** the message is a count plus at most three `examples`
- **AND** it does not list the full inventory in that text message

### Requirement: Generic check progress bus

#### Scenario: Predicate emits start and done without stream

- **GIVEN** a matching `deps.consistent` predicate on a transition attempt
- **WHEN** `TransitionChange` executes that attempt
- **THEN** progress includes `check-start` with id `deps.consistent` and label `Checking spec dependencies`
- **AND** progress includes `check-done` with the same id/label and the check outcome
- **AND** no `Executing:` prefix appears in the text rendering of those events

#### Scenario: Hook effect maps onto the same bus

- **GIVEN** matching `hook.post` with a long-running `run:` command
- **WHEN** `TransitionChange` executes
- **THEN** progress includes `check-start` for `hook.post` with label `Running post hooks`
- **AND** `RunStepHooks` output/heartbeats appear as `check-progress` for that id
- **AND** progress includes `check-done` for `hook.post` when the phase finishes

### Requirement: Approval precedence and production registry composition

#### Scenario: Parked approval is reported before protocol edge failure

- **GIVEN** a historic parked approval state receives a non-drain target
- **WHEN** transition checks are evaluated
- **THEN** the public repair reason is the matching approval requirement

#### Scenario: Production composition supplies overlap detection

- **WHEN** status or archive composition resolves its workflow check registry
- **THEN** the registry receives the overlap detector dependency

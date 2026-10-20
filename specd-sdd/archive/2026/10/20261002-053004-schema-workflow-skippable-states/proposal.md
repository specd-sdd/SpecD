# Proposal: schema-workflow-skippable-states

## Motivation

SpecD currently enforces a hardcoded, monolithic lifecycle topology (`drafting -> designing -> ready -> implementing -> verifying -> done -> archivable -> archiving`). This prevents schemas from tailoring workflows to different development contexts, such as lightweight or documentation-focused schemas that do not require verification phases (`verifying`), or changes that have no implementation tasks in `tasks.md` and should be able to cleanly bypass the coding phase (`implementing`). Today, any attempt to bypass or skip an intermediate step fails immediately with `INVALID_TRANSITION` via `protocol.edge`.

Furthermore, a comprehensive code audit of `@specd/core`, `@specd/schema-std`, and `@specd/skills` revealed deeply entrenched, hardcoded state machine assumptions and architectural omissions:

1. `buildAxis()` forcibly re-injects missing states, distorting direction classification.
2. `reconcile-change-validity.ts` and `archive-change.ts` hardcode that any state at or past `verifying` unconditionally requires verification, which causes non-verification schemas to fatally block archiving.
3. `resolveLifecycleNextHop` and `phaseCommand` assume rigid linear single-step progressions, leading to guidance stalling or infinite `/specd-implement` recommendation loops when steps are disabled or skipped.
4. `executeChecksByLegalTargets` only evaluates targets in the static `VALID_TRANSITIONS` table, ignoring legal bypass targets.
5. Tracked dirty files (`impl.filesResolved`) only check `from: 'implementing'` or `to: 'verifying'`, allowing uncommitted/unreviewed code modifications to bypass validation when `implementing` is skipped.
6. **Missing Declarative Check Grammar & Parser Gap in `schema.yaml`**: While ADR-0030 designed the Open Check Registry and `WorkflowStep.checks` in domain models, `packages/core/src/infrastructure/schema-yaml-parser.ts` completely omits `checks` from `WorkflowStepZodSchema`. Any check declarations written in `schema.yaml` are stripped out by Zod before reaching domain construction.
7. **Conflation of Entry Checks vs Bypass Preconditions**: A schema author configuring a workflow step needs to express two fundamentally distinct check sets:
   - **Entry / Transition Checks (`checks`)**: Invariants required when transitioning _into_ the step (`scope: 'transition'`).
   - **Bypass / Skip Checks (`skipChecks`)**: Preconditions that must be satisfied before the orchestrator permits _bypassing / skipping_ an optional step (`scope: 'step-skip'`).
     Currently, `schema.yaml` has no syntax for `skipChecks`, and `WorkflowStepCheckDeclaration` lacks awareness of step-skip scopes.
8. **Static Runtime Bindings in Use Cases**: In `TransitionChange` and `GetStatus`, `_transitionBindings` is a fixed, static array injected at kernel composition. Use cases never dynamically merge the check declarations (`checks` and `skipChecks`) declared on the Change's authoritative `Schema`, nor do they filter out checks declared as `disabled: true`, nor do they inject step-level configuration overrides into `CheckExecutionContext.config`.
9. **Missing Layer Merging for Step Checks**: `mergeSchemaLayers` needs to safely merge both `checks` and `skipChecks` arrays using identity collision detection, strictly enforcing monotonic governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`).
10. **Schema Resolution Coupled to Project Global Instead of Change**: While the `Change` domain entity and manifest loader hydrate `schemaName` and `schemaVersion`, use cases historically invoked `_schemaProvider.get()` without arguments, resolving the project's global default schema rather than treating `manifest.schema` as sovereign.
11. **Divergent Status and Execution Preflight**: Status evaluates legal target checks without evaluating the `step-skip` predicates for bypassed optional steps, while transition execution evaluates both. This can make `GetStatus` recommend a shortcut that `TransitionChange` rejects.
12. **Uncentralized Sovereign Schema Integrity**: Change-bound operations repeat named schema lookup independently. Provider identity validation is therefore inconsistent, and same-name version advisories can be derived from the workspace default instead of the schema actually resolved for the change.
13. **Recommendation Mistaken for Exclusivity in Skills**: Lifecycle skills treat `nextAction.command` as the only admissible route even when an explicitly requested lifecycle target is present in `lifecycle.availableTransitions`, preventing intentional redesign and retry flows.

This change introduces declarative `optional?: boolean` and `disabled?: boolean` on workflow steps, creates the authoritative `core:workflow-topology` domain service, formalizes the two-block schema grammar (`checks:` and `skipChecks:`), connects the YAML parser and domain validators, enforces monotonic governance locks (`allow*`), implements dynamic runtime binding composition with cascaded config resolution, aligns validity reconciliation with the active topology, and ensures sovereign change-schema authority across all operations. It also establishes `done` as an immutable delivery-completion anchor, shares candidate evaluation between status and execution, centralizes change-schema lookup and integrity in `ResolveChangeSchema`, and makes skills distinguish the preferred route from explicitly selected available alternatives.

---

## Current behaviour

1. **Static State Machine Topology**: `VALID_TRANSITIONS` and `HAPPY_PATH_NEXT` in `packages/core/src/domain/value-objects/change-state.ts` define fixed transitions independent of the active schema. `protocol.edge` strictly validates transitions against this static table without inspecting `schema.workflow()`.
2. **Schema Workflow as Mere Extras**: Schema `workflow[]` rows only attach extras (`requires`, `requiresTaskCompletion`, `hooks`, `checks`) to pre-existing states; they do not participate in protocol membership or legal hop definition.
3. **`buildAxis()` Fallback Splicing Trap (`transition-checks.ts`)**: `buildAxis()` iterates `AXIS_FALLBACK = ['ready', 'implementing', 'verifying', 'done', 'archivable', 'archiving']` and forcibly splices any missing state back into the progress axis, corrupting `classifyAlong()` direction (`forward`/`backward`) and check matching when steps are disabled or omitted.
4. **Hardcoded Verification Boundaries in Validity, Reconciler, and Archive**:
   - `reconcile-change-validity.ts#L277-L286` hardcodes `verificationRequired(change)` to return `true` whenever `state` is `verifying`, `done`, `archivable`, `archiving`, `pending-signoff`, or `signed-off`, without checking if `verifying` is enabled in the schema.
   - `lifecycle-verdict.ts#L939-L948` and `invalidate-verification.ts#L123-L129` duplicate this hardcoded `verificationBoundary(state)` list.
   - If `verifying` is disabled, entering `done` or `archivable` flags `VERIFICATION_REQUIRED` blockers and permanently blocks archiving.
5. **Guidance Stalling and Infinite Loops in `resolveLifecycleNextHop` and `phaseCommand`**: If `implementing` is skipped or `verifying` is disabled, `lifecycle-verdict.ts` and `lifecycle-guidance.ts` fall through to recommending staying in the current state or repeatedly suggest `/specd-implement` in an infinite loop.
6. **`executeChecksByLegalTargets` Only Evaluates Static Targets**: `executeMatchingPredicates.ts` iterates `for (const target of VALID_TRANSITIONS[input.change.state])`. Shortcut hops (`ready -> verifying`, `ready -> done`) are never evaluated for readiness.
7. **Implementation Tracking Bypass Gap**: `impl.filesResolved` and `impl.linksInScope` only apply to `{ from: 'implementing', to: '*', along: 'forward' }` and `{ to: 'verifying' }`. If `implementing` is bypassed directly to `done` or `archivable`, unreviewed dirty files in git elude validation.
8. **YAML Parser Omission of Workflow Step Checks**: In `packages/core/src/infrastructure/schema-yaml-parser.ts`, `WorkflowStepZodSchema` only parses `step`, `optional`, `disabled`, `requires`, `requiresTaskCompletion`, and `hooks`. Any `checks:` block declared in `schema.yaml` is stripped during parsing.
9. **Absence of Declarative `skipChecks` Grammar**: There is no declarative mechanism for a schema to bind checks to the bypass event of an optional step. While the kernel has built-in `scope: 'step-skip'` bindings (`workflow.tasksEmpty`), schema authors cannot declare custom skip checks or configure built-in skip checks in `schema.yaml`.
10. **Disconnected Runtime Binding Composition**: Use cases (`TransitionChange`, `GetStatus`) evaluate only static `_transitionBindings` injected at construction time. Schema-declared step checks and skip checks are never compiled into the active evaluation set, declarative `disabled: true` overrides are ignored, and step configs are never merged into `CheckExecutionContext.config`.
11. **Sovereign Schema Authority Bypass**: Use cases previously loaded schemas from `_schemaProvider.get()` without change reference, evaluating changes against `specd.yaml` instead of their recorded `manifest.schema`.

---

## Proposed solution

### 1. Declarative Step Properties & Two-Block Checks Syntax in Schema (`schema.yaml`)

Each workflow step in `schema.yaml` explicitly separates entry transition checks from bypass skip checks:

```yaml
workflow:
  - step: implementing
    optional: true
    disabled: false
    requires: [specs, design, tasks]
    requiresTaskCompletion: [tasks]

    # Block 1: Normal checks evaluated when transitioning INTO this step (scope: 'transition')
    checks:
      - id: '@security.code-scan'
        along: forward # 'forward' | 'backward' | '*' (default: 'forward')
        from: '*' # ChangeState | '*' (default: '*')
        onFailure: abort # 'abort' | 'collect' (default: 'abort')
        skippable: true # Permits CLI bypass via --skip-checks @security.code-scan
        config: # Step-specific config merged over check defaults
          minSeverity: critical
      - id: 'impl.linksInScope'
        disabled: true # Declaratively disables Cat-C check on this step

    # Block 2: Skip checks evaluated when this optional step is BYPASSED (scope: 'step-skip')
    skipChecks:
      - id: 'workflow.tasksEmpty'
        onFailure: abort
        skippable: false
      - id: '@qa.allow-bypass'
        skippable: false
        config:
          requireSignoffApproval: true
```

- **Backward Compatibility**: Canonical states omitted from `workflow[]` default to enabled (`disabled: false`, `optional: false`). A step is only excluded from the active lifecycle graph if explicitly declared `disabled: true`.
- **Validation Invariant**: `skipChecks` may only be declared on steps that are not `disabled: true`. Declaring `skipChecks` on a `disabled: true` step throws `SchemaValidationError`.

### 2. Domain Value Objects & Schema YAML Parser (`schema-yaml-parser.ts`)

- In `packages/core/src/domain/value-objects/workflow-step.ts`:
  - `WorkflowStepCheckDeclaration`: Declares transition checks (`id`, `from?`, `along?`, `onFailure?`, `skippable?`, `disabled?`, `config?`).
  - `WorkflowStepSkipCheckDeclaration`: Declares step-skip checks (`id`, `onFailure?`, `skippable?`, `disabled?`, `config?`).
  - `WorkflowStep`: Exposes `optional?: boolean`, `disabled?: boolean`, `checks?: readonly WorkflowStepCheckDeclaration[]`, and `skipChecks?: readonly WorkflowStepSkipCheckDeclaration[]`.
- In `packages/core/src/infrastructure/schema-yaml-parser.ts`:
  - Implement `WorkflowStepCheckZodSchema` and `WorkflowStepSkipCheckZodSchema`.
  - Update `WorkflowStepZodSchema` to parse and transform `checks` and `skipChecks` into `WorkflowStepRaw`.
  - Ensure `parseSchemaYaml` preserves all check declarations without stripping.

### 3. Comprehensive Governance Contracts & Monotonic Locks

Semantic validation in `buildSchema` enforces the two-tier governance model for both `checks` and `skipChecks`:

1. **`allowSchemaEmbedding`** (check-level placement lock, built-ins and plugins):
   - When `false`, `schema.yaml` CANNOT place the check at a coordinate the code did not define (throws `CheckEmbeddingForbiddenError`). Category A (protocol invariants), Category B (native step attributes), and confined plugin checks set it to `false`.
   - Declaring any check (built-in or plugin) at a coordinate where code already binds it is not embedding; it is always allowed, subject to that coordinate's locks.
2. **`allowBindingOverride`** (policy lock on code-defined bindings only):
   - On a code-defined coordinate `{checkId, scope, to/step, along}` with `allowBindingOverride: false`, the schema CANNOT alter `onFailure` or `skippable` (throws `CheckBindingOverrideForbiddenError`).
   - It no longer confines placement; confinement is `allowSchemaEmbedding`.
   - Bindings a schema creates are schema-owned: later schema layers (`extends`, schema plugins, `schemaOverrides`) MAY modify or remove them without this lock; only the check-level `allowConfigOverride` / `allowDisable` locks still apply to them.
3. **`allowConfigOverride`**:
   - If set to `false` at the check or binding level, `schema.yaml` CANNOT provide or override `config` on that coordinate (throws `CheckConfigOverrideForbiddenError`).
4. **`allowDisable`**:
   - If set to `false` at the check or binding level, `schema.yaml` CANNOT declare `disabled: true` on that coordinate (throws `CheckDisableForbiddenError`). Protocol invariants (Category A & B) permanently enforce `allowDisable: false`.
5. **Principle of Monotonic Governance Locks**:
   - Locks set by code (check registration or code-defined bindings) operate under monotonic restriction (least privilege). No schema layer merger (`mergeSchemaLayers`), redeclaration, or plugin extension can relax them to `true`. Schema-owned bindings carry no code-defined binding locks, so later schema layers may change them within the check-level locks.
6. **Built-in Checks Categorization Matrix**:
   - **Category A (Protocol & State Invariants)** (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`): `allowSchemaEmbedding: false`, `allowBindingOverride: false`, `allowDisable: false`, `skippable: false`.
   - **Category B (Native Step Attributes)** (`workflow.requires`, `workflow.taskCompletion`, `workflow.tasksEmpty`, `approval.spec`, `approval.signoff`): `allowSchemaEmbedding: false`, `allowBindingOverride: false`, `allowDisable: false`. Managed through step top-level attributes, not `checks: []`.
   - **Category C (Policy & Consistency Checks)** (`impl.linksInScope`, `spec.overlap`, `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`): `allowSchemaEmbedding: true`, `allowBindingOverride: true`, `allowDisable: true`. Schemas may bind them, configure them, or declaratively disable them. When embedded at a new coordinate they execute their real application implementation, never a domain stub.

### 4. Schema Layer Merging (`merge-schema-layers.ts`)

`mergeSchemaLayers` safely aggregates both `step.checks` and `step.skipChecks` arrays using identity collision validation (`addToArray`), ensuring check declarations across extended layers (`extends`, `schema-plugin`) cannot accidentally clobber or erase existing governance locks.

### 5. Centralized Workflow Topology Engine (`workflow-topology` module)

The authoritative domain service (`specs/core/workflow-topology/spec.md`) is a module of pure exported functions (not a static class), following the global architecture rule that stateless domain services are plain functions. Function names carry the `workflow` qualifier so call sites are self-describing:

1. Constructing the workflow pipeline (`resolveWorkflowPipeline(schema, approvals)`). The pipeline order is always the canonical lifecycle order (`drafting → designing → ready → implementing → verifying → done → archivable → archiving`). The order of `workflow[]` rows carries no meaning: rows only carry per-step properties, and rows declared out of order are normalized silently.
2. Validating structural invariants (bedrock immutability, approval anchor protections). Forward connectivity from `designing` to `archivable` is guaranteed by construction (bedrock anchors cannot be disabled and disabled steps are removed from the pipeline), so no separate reachability guard exists. Disabling every configurable delivery step (`ready` when the spec gate is off, `implementing`, `verifying`) is valid.
3. Deriving legal transitions (`listWorkflowTransitions(from, schema, approvals)`) and testing hop legality (`isWorkflowTransitionLegal(from, to, schema, approvals)`). The pipeline is the single forward authority; canonical `VALID_TRANSITIONS` moves are admitted only when they move backward along the pipeline or are drain/escape moves for their exact source state.
4. Detecting bypassed intermediate steps (`listBypassedWorkflowSteps(from, to, schema, approvals)`).
5. Deriving the next topological forward step (`nextWorkflowStep(from, schema, approvals)`).
6. Determining step enablement (`isWorkflowStepEnabled(step, schema)`).

### 6. Dedicated `step-skip` Scope in Check Registry

- Extend `CheckAttempt` with `{ readonly scope: 'step-skip'; readonly step: ChangeState; readonly from: ChangeState; readonly to: ChangeState }`.
- Extend `CheckApplicability` with `StepSkipApplicability` (`{ readonly scope: 'step-skip'; readonly step: ChangeState | '*' }`).
- Built-in `step-skip` bindings on `step: 'implementing'`:
  - `workflow.tasksEmpty` (`skippable: false`, `allowDisable: false`).
  - `impl.filesResolved` (`skippable: false`, `allowDisable: true`).
  - `impl.linksInScope` (`skippable: true`, `allowDisable: true`).

### 7. Dynamic Runtime Binding Resolution & Cascaded Config Resolution

Introduce domain resolution helper `resolveEffectiveBindings(baseBindings, schema, targetStep, bypassedSteps)`:

1. **Target Step Transition Bindings**:
   - Start with base transition bindings (`builtins` + `kernel plugins`).
   - Overlay `schema.workflowStep(targetStep).checks`:
     - If `chk.disabled === true`: Filter out the check from the active evaluation for this coordinate.
     - If `chk` defines a new binding: Synthesize a `CheckBinding` with `scope: 'transition'`.
     - Resolve cascaded config via `deepMergeConfig(checkDefaultConfig, bindingDefaultConfig, chk.config)` and attach to `CheckExecutionContext.config`.
2. **Bypassed Step Skip Bindings**:
   - For each bypassed step `S` in `bypassedSteps`:
     - Start with base step-skip bindings for `step: S`.
     - Overlay `schema.workflowStep(S).skipChecks`:
       - If `chk.disabled === true`: Filter out the skip check.
       - If `chk` defines a new binding: Synthesize a `CheckBinding` with `scope: 'step-skip'`, `step: S`.
       - Resolve cascaded config via `deepMergeConfig`.
3. **Use Case Integration**: `TransitionChange` and `GetStatus` invoke `resolveEffectiveBindings` using the Change's sovereign `Schema`, ensuring all declared checks, disabled flags, and configs participate in transition and status evaluations.

### 8. Step-Skip Check Evaluation in `TransitionChange`

When a transition `from -> to` bypasses intermediate step(s) `S`:

1. Verify each bypassed step is declared `optional: true` or `disabled: true`.
2. For `optional: true` steps, invoke all resolved checks bound to `{ scope: 'step-skip', step: S }`.
3. If any skip check fails, halt transition with typed repair guidance.
4. **Hook Non-Execution**: When a step `S` is bypassed, neither `S.pre` nor `S.post` hooks run.

### 9. Topology-Aware Validity & Archive Reconciler

- Update `verificationRequired(change)` in `reconcile-change-validity.ts`, `verificationBoundary` in `lifecycle-verdict.ts`, and `invalidate-verification.ts` to consult `WorkflowTopology.isStepEnabled('verifying', schema)`.
- When `verifying` is disabled: `facts.verificationRequired` resolves to `false`, `verdict.verification` resolves to `'not-required'`, and `archive-change.ts` allows immediate archiving without verification blockers.

### 10. Lifecycle Invariant Guards & Immutability

- **Bedrock States**: `drafting`, `designing`, `done`, and `archivable`/`archiving` can never be optional or disabled.
- **Approval Anchor**: `ready` cannot be disabled if `approvals.spec: true`.
- **Completion Boundary**: `done` always represents completed development and verification, owns the in-place signoff wait and retry boundary, and remains distinct from archive eligibility. When signoff is disabled, `approval.signoff` skips on `done -> archivable`; the workflow does not remove `done`.
- Violations throw `SchemaValidationError`.

### 11. Next-Action Guidance & Dynamic Skill Decoupling

- `resolveLifecycleNextHop` and `phaseCommand` consult `WorkflowTopology.nextForwardStep(state)` to derive the destination and recommended command.
- Agent skills inspect `nextAction.command` and `lifecycle.availableTransitions` from `changes status --format toon` rather than hardcoding step transitions.
- `nextAction` remains the single preferred route when the user has not selected a lifecycle action. An explicit skill invocation MAY select its target when that target is advertised in `availableTransitions`, even when another route is preferred. The skill stops only when its target is unavailable or blocked.
- Presenters distinguish the recommended command from other available lifecycle skills instead of presenting the recommendation as the complete legal action set.

### 12. Change-Driven Sovereign Schema Authority

- The schema recorded in `manifest.schema` (`change.schemaName` and `change.schemaVersion`) is the sovereign authority for that change throughout its entire lifecycle.
- A shared `ResolveChangeSchema` application boundary performs `schemaProvider.get(change.schemaName)` for every change-bound operation, verifies that the returned canonical name equals the requested name, and compares the persisted version with the resolved same-name schema version.
- A different workspace default is valid and irrelevant. A same-name version difference emits an advisory and continues. A returned canonical-name mismatch throws `SchemaProviderIdentityMismatchError`; mutating operations propagate it without continuing.
- `GetStatus` degrades lookup failure to `SCHEMA_RESOLUTION_FAILED` and identity mismatch to `SCHEMA_IDENTITY_MISMATCH`, and does not project topology or actions from an untrusted schema.

### 13. Shared Transition Candidate Evaluation

- One shared evaluator computes bypassed steps and evaluates both normal transition predicates and every applicable `step-skip` predicate for a candidate target.
- `GetStatus` uses the evaluator in projection-only mode. `TransitionChange` recalculates through the same evaluator using fresh state, then alone owns effects, hooks, mutation, and persistence.
- An optional step with an empty effective `step-skip` predicate set remains an unconditional bypass; no skill-level heuristic may replace that result.

### 14. Post-Verification Revision (2026-10-16)

A full `/specd-verify` run (compliance report `reports/20261016-125213/`) failed. The revision keeps the architecture above and resolves the following, as agreed with the user:

- **Canonical pipeline order** (see §5): removes the reorder path through which `verifying → done` skipped `ready`/`implementing` and the spec-approval check.
- **Reachability by construction** (see §5): the vacuous reachability guard and the "disconnected graph" scenario are removed.
- **Verification follows topology** (§9 was not implemented): `verificationRequired` in the reconciler MUST consult the change schema; with `verifying` disabled, `done`, sign-off, and archive MUST NOT require verification evidence.
- **Sovereign schema everywhere**: the validity reconciler, the change repository's artifact-type sync, post-archive metadata regeneration, and the CLI artifact DAG (`changes status`, `changes validate`, `changes spec-preview`, `changes artifacts`) MUST use the change's schema through `ResolveChangeSchema`. `ResolveChangeSchema` returns `{ schema, warnings }` with typed advisories; the only version advisory is the resolver's same-name drift (no comparison against the workspace default).
- **Check pipeline correctness**: single-pass config cascade (no double merge or array duplication); protocol fail-fast restored; target-step and step-skip disablement isolated; step checks honor `from`/`along`; plugin `allowDisable` and plugin default `step-skip` bindings forwarded by composition; drain states gain no forward shortcuts; `buildSchema` rejects drain-state rows, step names in `requires`, and a disabled `ready` while the spec gate is on.
- **Errors**: `TransitionChange` maps `protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, and approval predicate failures to `InvalidStateTransitionError` with canonical reasons, and every other predicate failure (Category C, plugin, step-skip) to `CheckPredicateFailedError` carrying `skippable`.
- **Plugin names**: external checks are always `@plugin.id` namespaced and cannot collide with built-ins; `InvalidPluginNameError` covers only invalid plugin-name grammar.
- **edit-change / preview-spec**: compatibility is always decided by the change schema; preview "always succeeds" applies to merge/content failures only, while schema resolution and identity errors propagate.
- **CLI**: `changes transition` requires `<name>` and exactly one of `<step>` or `--next`; `--next` keeps entering the nearest enabled step (including an optional one). With `--skip-hooks`, skipped hooks render as skipped, never as passed.
- **Skills**: lifecycle templates derive every target and hook from structured status and never run hooks for disabled or bypassed steps; a test parses the real templates and rejects unconditional target recipes, replacing tests that only exercised a test-local simulator.
- **Tests**: replace fakes that masked real behavior (the `makeObservingReconcile` verification default) with real-reconciler coverage.

### 15. Second Post-Verification Revision (2026-10-18)

A second full `/specd-verify` run (attempt `verification-attempt-12`, compliance report `reports/20261017-095914/`) failed. Agreed with the user:

- **Governance split** (see §3): `allowSchemaEmbedding` becomes the placement lock; `allowBindingOverride` only protects policy of code-defined bindings; declaring a check at its own code-defined coordinate is always allowed; schema-owned bindings may be changed by later schema layers.
- **Real check instances**: the composition `CheckRegistry` MUST expose application check instances (`create*`), never the domain matcher stubs, so schema-embedded checks evaluate real facts.
- **Single cascade**: `resolveEffectiveBindings` is the only place that applies schema declarations (disabled, config, from/along, skippable/onFailure). The predicate executor runs resolved bindings unchanged; overlays honor the step declaration's `from`/`along`; wildcard step-skip rows are narrowed to the concrete bypassed step; skippability and `bypassFlag` come from effective bindings.
- **Refresh flag**: `refreshImplementationTrackingBefore: false` skips only the pre-evaluation refresh; the post-hook reconcile always refreshes tracking.
- **Topology-driven guidance**: no hardcoded verification boundary or recovery command; `nextWorkflowStep` from drain states returns only legal targets; `run-hooks` returns no `run:` hooks for a disabled step.
- **Sovereign schema leftovers**: post-archive metadata generation uses the change schema; `LazySchemaProvider` resolves a named schema without first resolving the workspace default; CLI `validate` exits 3 on change-schema resolution or identity failure and reports the identity code.
- **Spec drift aligned to code**: `changes status` reports version drift as `SCHEMA_VERSION_DRIFT` in `warnings` / `schemaWarnings`; bypass flags are `--skip-checks <id>`; the sovereign lookup is name-only with a version advisory; minor wording fixes across standard-schema, fs-change-repository, count-tasks, transition-checks, check-registry, approve-signoff, change-validate.

---

## Specs affected

### New specs

- `core:workflow-topology`:
  - Authoritative domain service computing ordered workflow pipelines, reachability and gate invariants, dynamic legal transitions, bypassed step detection, and topological forward progression.
  - Depends on: `core:workflow-model`, `core:schema-format`, `default:_global/architecture`
- `core:resolve-change-schema`:
  - Shared application boundary for resolving a change's sovereign schema, enforcing provider identity integrity, and producing same-name version advisories independently of the workspace default.
  - Depends on: `core:change`, `core:schema-format`, `default:_global/error-handling-conventions`

### Modified specs

- `core:workflow-model`:
  - Define schema workflow step declarations for `optional`, `disabled`, `checks: []`, and `skipChecks: []`. Enforce reachability and gate anchor restrictions.
- `core:check-registry`:
  - Extend catalog, governance, and query API to support `scope: 'step-skip'`. Formalize two-tier governance (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) and monotonic lock enforcement across `checks` and `skipChecks`.
- `core:transition-checks`:
  - Add `step-skip` variant to `CheckAttempt` and `StepSkipApplicability` to `CheckApplicability`. Bind `workflow.tasksEmpty` and `impl.filesResolved` to `scope: 'step-skip'`. Implement dynamic binding resolution (`resolveEffectiveBindings`) and cascaded config injection via `deepMergeConfig`. Replace fallback splicing in `buildAxis()` with `WorkflowTopology` axis filtering.
- `core:transition-change`:
  - Delegate transition validation to `WorkflowTopology.isLegalTransition`. Use the shared candidate evaluator for target and bypass checks before mutating. Ensure bypassed steps omit hooks and effects remain mutation-owned.
- `core:lifecycle-engine`:
  - Delegate pipeline construction and legal transition evaluation to `WorkflowTopology`. Make `evaluateLifecycleVerdict`, `resolveLifecycleNextHop`, and `verificationBoundary` topology-aware. Share full candidate evaluation, including bypassed-step predicates, between status and execution.
- `core:schema-format`:
  - Define `checks` and `skipChecks` syntax and properties under workflow steps. Document validation rules and governance error conditions.
- `schema-std:standard-schema`:
  - Update `@specd/schema-std` specification and `schema.yaml` contract to declare `optional: true` and `disabled: true` on `workflow[]` steps.
- `cli:change-status`:
  - Project the ordered workflow pipeline in `changes status` (annotating optional steps, omitting disabled steps), expose bypass paths in available transitions, and report auto-skip recommendations.
- `cli:change-transition`:
  - Support schema-aware `--next` advancement and execution of permissible bypass transitions evaluated via `step-skip` checks.
- `skills:workflow-automation`:
  - Direct skills to consume dynamic topology and distinguish the preferred `nextAction` from explicitly invoked targets in `availableTransitions`. Formalize hook non-execution for bypassed steps.
- `core:get-status`:
  - Project only candidates that pass the shared transition and step-skip evaluator; degrade schema resolution and identity failures to typed blockers without projecting untrusted topology.
- `core:change`:
  - Define shared sovereign-schema resolution semantics, canonical identity integrity, and same-name version advisory behavior for every change-bound operation. Make verification requirement and artifact sync follow the change schema's topology and artifact types.
- `core:fs-change-repository`:
  - Artifact-type resolution used by load/save sync MUST resolve the change's recorded schema, never the workspace default.
  - Depends on (added): `core:resolve-change-schema`
  - Depends on (removed): none
- `cli:change-validate`:
  - The artifact DAG and artifact-ID lookup MUST come from the change's schema.
  - Depends on (added): `core:resolve-change-schema`
  - Depends on (removed): none
- `cli:change-spec-preview`:
  - Artifact-name resolution MUST use the change's schema.
  - Depends on (added): `core:resolve-change-schema`
  - Depends on (removed): none
- `cli:change-artifacts`:
  - Artifact listing and order MUST come from the change's schema.
  - Depends on (added): `core:resolve-change-schema`
  - Depends on (removed): none

---

- `core:generate-metadata`:
  - Extraction schema precedence: explicit `schemaName` (change context) → persisted `spec-lock` schema identity → project default (legacy lock-less specs outside a change). Provenance schema identity describes the schema actually used.
  - Depends on (added): `core:resolve-change-schema`, `core:spec-lock`
  - Depends on (removed): none
- `core:materialize-spec-metadata`:
  - Optional `schemaName` input forwarded unchanged to `GenerateSpecMetadata` and used for freshness; `ArchiveChange` passes the change's schema.
  - Depends on (added): `core:resolve-change-schema`
  - Depends on (removed): none

## Impact

### Affected Code Areas & Packages

- **`packages/core/src/domain/value-objects/workflow-step.ts`**:
  - Add `WorkflowStepCheckDeclaration` and `WorkflowStepSkipCheckDeclaration`.
  - Add `optional?`, `disabled?`, `checks?`, and `skipChecks?` to `WorkflowStep`.
- **`packages/core/src/infrastructure/schema-yaml-parser.ts`**:
  - Define `WorkflowStepCheckZodSchema` and `WorkflowStepSkipCheckZodSchema`.
  - Update `WorkflowStepZodSchema` and `WorkflowStepRaw`.
- **`packages/core/src/domain/services/build-schema.ts`**:
  - Validate `step.checks` and `step.skipChecks` against `CheckRegistry`.
  - Validate coordinate uniqueness and enforce `allowBindingOverride`, `allowConfigOverride`, `allowDisable`.
- **`packages/core/src/domain/services/merge-schema-layers.ts`**:
  - Safely merge `step.checks` and `step.skipChecks` with identity collision detection.
- **`packages/core/src/domain/services/transition-checks.ts`**:
  - Support `scope: 'step-skip'` in `CheckAttempt` and `CheckApplicability`.
  - Implement `resolveEffectiveBindings(baseBindings, schema, targetStep, bypassedSteps)` with cascaded `deepMergeConfig`.
- **`packages/core/src/domain/services/workflow-topology.ts`**:
  - Single source of truth for pipeline ordering, reachability, legal hops, bypassed steps, and step enablement.
- **`packages/core/src/domain/services/check-bindings.ts`**:
  - Register built-in step-skip bindings.
- **`packages/core/src/domain/checks/protocol-edge.ts`**:
  - Validate legal transitions and bypasses via `WorkflowTopology`.
- **`packages/core/src/domain/checks/workflow-tasks-empty.ts`**:
  - Dedicated predicate verifying task completion counts before skipping `implementing`.
- **`packages/core/src/application/use-cases/transition-change.ts`**:
  - Dynamically resolve effective bindings per change schema and execute step-skip checks for bypassed steps.
- **`packages/core/src/application/use-cases/get-status.ts`**:
  - Dynamically resolve effective bindings per change schema and project blockers/remediation.

---

## Exhaustive Verification & Test Strategy

The test suite will comprehensively verify the complete matrix across unit, integration, and CLI layers:

1. **Schema YAML Parsing Tests (`schema-yaml-parser.spec.ts`)**:
   - Parse `schema.yaml` with `optional: true` and `disabled: true`.
   - Parse `schema.yaml` with `checks:` (all fields: `id`, `along`, `from`, `onFailure`, `skippable`, `disabled`, `config`).
   - Parse `schema.yaml` with `skipChecks:` (all fields: `id`, `onFailure`, `skippable`, `disabled`, `config`).
   - Reject invalid check fields or malformed enums.
2. **Schema Compilation & Governance Enforcement Tests (`build-schema.spec.ts`)**:
   - Reject unknown check IDs in `checks` and `skipChecks` with `UnknownCheckError`.
   - Reject duplicate check coordinates with `DuplicateCheckBindingError`.
   - Reject embedding Category A or Category B checks in `checks` or `skipChecks` with `CheckEmbeddingForbiddenError`.
   - Reject altering `onFailure` or `skippable` when `allowBindingOverride: false` with `CheckBindingOverrideForbiddenError`.
   - Reject overriding locked config when `allowConfigOverride: false` with `CheckConfigOverrideForbiddenError`.
   - Reject `disabled: true` when `allowDisable: false` with `CheckDisableForbiddenError`.
   - Reject `skipChecks` on `disabled: true` steps with `SchemaValidationError`.
3. **Layer Merger Tests (`merge-schema-layers.spec.ts`)**:
   - Verify `mergeSchemaLayers` correctly appends/prepends `checks` and `skipChecks`.
   - Verify identity collisions are detected and monotonic governance locks are preserved.
4. **Dynamic Binding Composition Tests (`transition-checks.spec.ts`)**:
   - Verify `resolveEffectiveBindings` includes schema-declared checks and skip-checks.
   - Verify checks declared with `disabled: true` are excluded from execution.
   - Verify cascaded config resolution: `deepMergeConfig(checkDefault, bindingDefault, schemaConfig)` injects accurate `ctx.config`.
5. **Runtime Transition Execution Tests (`transition-change.spec.ts`)**:
   - Transition executing custom plugin checks declared in `schema.yaml`.
   - Transition bypassing optional steps evaluating declared `skipChecks`.
   - Transition failing when a declared skip check fails, verifying formatted error and repair guidance.
   - Transition succeeding when skip checks pass or are bypassed via permitted `--skip-checks`.
   - Confirm hooks for bypassed steps do NOT execute.
   - Confirm change sovereign schema is resolved and used throughout, completely isolated from workspace `specd.yaml`.
6. **CLI Command Tests (`change-transition.spec.ts`, `change-status.spec.ts`)**:
   - Verify `specd change transition <name> <target>` runs schema checks and skip checks.
   - Verify `specd change status <name>` projects blockers from custom checks declared in the schema.

---

## Open questions

_None. Architectural boundaries, governance invariants, and declarative syntax are fully specified._

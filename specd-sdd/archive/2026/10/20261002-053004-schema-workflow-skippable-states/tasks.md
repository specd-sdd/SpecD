# Tasks: schema-workflow-skippable-states

## 1. Domain Models & Schema Parsing

- [x] 1.1 Add `optional` and `disabled` properties to `WorkflowStep`
      `packages/core/src/domain/value-objects/workflow-step.ts`: `WorkflowStep` — add optional boolean properties
      Approach: add `readonly optional?: boolean` and `readonly disabled?: boolean` to the `WorkflowStep` interface
      (Req: core:workflow-model: Optional and disabled step declarations)

- [x] 1.2 Update schema YAML parser and Zod schema for workflow steps
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `WorkflowStepZodSchema` and `WorkflowStepRaw` — parse and transform `optional` and `disabled`
      Approach: add `optional: z.boolean().optional()` and `disabled: z.boolean().optional()` to `WorkflowStepZodSchema`, transforming to `WorkflowStepRaw` with default `false` values
      (Req: core:workflow-model: Optional and disabled step declarations)

- [x] 1.3 Update `buildSchema` to populate `optional` and `disabled` on `WorkflowStep` entities
      `packages/core/src/domain/services/build-schema.ts`: `buildSchema` — map raw step flags to domain `WorkflowStep` instances
      Approach: assign `optional: raw.optional ?? false` and `disabled: raw.disabled ?? false` when instantiating `WorkflowStep` in the domain schema
      (Req: core:workflow-model: Optional and disabled step declarations)

## 2. Workflow Topology Domain Service

- [x] 2.1 Implement `WorkflowTopology.orderedPipeline` and reachability validation
      `packages/core/src/domain/services/workflow-topology.ts`: `WorkflowTopology.orderedPipeline` — construct ordered active pipeline and enforce invariants
      Approach: assemble canonical states (`drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `archiving`), overlay schema declarations, reject disabling bedrock states (`drafting`, `designing`, `archiving`, `archivable`) or active approval anchors (`ready` with spec gate, `done` with signoff gate), and verify reachability from `designing` to `archivable` throwing `SchemaValidationError` on violations
      (Req: core:workflow-topology: Ordered pipeline construction, Graph reachability invariant)

- [x] 2.2 Implement `WorkflowTopology.legalTransitions` and `isLegalTransition`
      `packages/core/src/domain/services/workflow-topology.ts`: `WorkflowTopology.legalTransitions` and `isLegalTransition` — compute valid destination states
      Approach: compute forward transitions, backward transitions to preceding non-terminal active steps, and shortcut transitions over optional/disabled steps; exclude disabled destination steps
      (Req: core:workflow-topology: Dynamic legal transitions)

- [x] 2.3 Implement `WorkflowTopology.bypassedSteps` and `nextForwardStep`
      `packages/core/src/domain/services/workflow-topology.ts`: `WorkflowTopology.bypassedSteps` and `nextForwardStep` — calculate intermediate bypassed steps and forward progression
      Approach: return intermediate active pipeline steps strictly between `from` and `to`, excluding disabled steps; return closest subsequent active step for `nextForwardStep` (or null at terminal states)
      (Req: core:workflow-topology: Bypassed step detection, Topological forward progression)

- [x] 2.4 Implement `WorkflowTopology.isStepEnabled` and export service
      `packages/core/src/domain/services/workflow-topology.ts` and `packages/core/src/domain/services/index.ts`: export `WorkflowTopology`
      Approach: return `true` if step is not disabled in the schema; re-export `WorkflowTopology` from domain services barrel
      (Req: core:workflow-topology: Step enablement and verification boundary)

## 3. Step-Skip Check System & Check Registry

- [x] 3.1 Extend `CheckApplicability` and `CheckAttempt` with `scope: 'step-skip'`
      `packages/core/src/domain/services/transition-checks.ts`: `CheckApplicability`, `CheckAttempt`, `checkMatches` — add step-skip discriminator variant
      Approach: add `{ readonly scope: 'step-skip'; readonly step: ChangeState | '*' }` to `CheckApplicability` and `{ readonly scope: 'step-skip'; readonly step: ChangeState; readonly from: ChangeState; readonly to: ChangeState }` to `CheckAttempt`; update `checkMatches` to match on `step`
      (Req: core:transition-checks: Step-skip check scope and applicability)

- [x] 3.2 Update `classifyAlong` to derive progress axis from `WorkflowTopology.orderedPipeline`
      `packages/core/src/domain/services/transition-checks.ts`: `classifyAlong` — replace hardcoded `AXIS_FALLBACK` with topology-derived active pipeline
      Approach: pass active pipeline steps from `WorkflowTopology.orderedPipeline(schema, approvals)` into `classifyAlong`, ensuring disabled steps are excluded from the axis
      (Req: core:transition-checks: Applicability from, to, and along)

- [x] 3.3 Update `CheckRegistry` coordinate key generation for `scope: 'step-skip'`
      `packages/core/src/domain/services/check-registry.ts`: `CheckRegistry` — handle step-skip coordinate uniqueness
      Approach: update `coordinateKey` helper to serialize `${checkId}::step-skip::${step ?? '*'}` when `scope === 'step-skip'`, enforcing duplicate prevention
      (Req: core:check-registry: Binding coordinate identity and duplicate prevention)

- [x] 3.4 Implement `workflow.tasksEmpty` check
      `packages/core/src/domain/checks/workflow-tasks-empty.ts`: `workflowTasksEmpty` — validate that tasks are complete or empty before skipping `implementing`
      Approach: implement `runTasksEmpty(facts)` returning `pass('workflow.tasksEmpty')` when `taskCounts.total.incomplete === 0` or `taskCounts.total.total === 0`, otherwise returning `fail('workflow.tasksEmpty', 'INCOMPLETE_TASKS', ...)`
      (Req: core:transition-checks: Registry bindings for this capability)

- [x] 3.5 Register step-skip bindings in `TRANSITION_BINDING_SPECS`
      `packages/core/src/domain/services/check-bindings.ts`: `TRANSITION_BINDING_SPECS` — bind `workflow.tasksEmpty`, `impl.filesResolved`, and `impl.linksInScope` under `scope: 'step-skip'`
      Approach: bind `workflow.tasksEmpty` under `{ scope: 'step-skip', step: 'implementing' }` with `skippable: false`; bind `impl.filesResolved` under `{ scope: 'step-skip', step: 'implementing' }` with `skippable: false`; bind `impl.linksInScope` under `{ scope: 'step-skip', step: 'implementing' }` with `skippable: true`
      (Req: core:transition-checks: Registry bindings for this capability)

- [x] 3.6 Update `protocol.edge` check to evaluate `WorkflowTopology.isLegalTransition`
      `packages/core/src/domain/checks/protocol-edge.ts`: `protocolEdge` — delegate legal transition validation to topology
      Approach: accept `schema` and `approvals` in `ProtocolEdgeFacts`, calling `WorkflowTopology.isLegalTransition(facts.from, facts.to, facts.schema, facts.approvals)` instead of static `isValidTransition`
      (Req: core:transition-change: Bypassed step evaluation and hook suppression)

## 4. Sovereign Schema Authority & LazySchemaProvider

- [x] 4.1 Update `SchemaProvider` port and `ResolveSchema` use case to support schema reference resolution
      `packages/core/src/application/ports/schema-provider.ts` and `packages/core/src/application/use-cases/resolve-schema.ts`: `SchemaProvider.get(ref?: string)` and `ResolveSchema.execute({ schemaRef?: string })`
      Approach: update interface signature to accept optional `ref?: string`; update `ResolveSchema.execute` to use target reference when supplied
      (Req: core:workflow-model: Optional and disabled step declarations)

- [x] 4.2 Update `LazySchemaProvider` to cache schemas by reference
      `packages/core/src/composition/lazy-schema-provider.ts`: `LazySchemaProvider` — cache schemas by ref
      Approach: maintain an internal `Map<string, Schema>` caching resolved schemas by reference, resolving default schema when `ref` is undefined
      (Req: core:workflow-model: Optional and disabled step declarations)

- [x] 4.3 Update `FsChangeRepository` to hydrate changes with recorded manifest schema without rejecting on workspace schema name mismatch
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository.get` — remove `SchemaMismatchError` check on active schema name
      Approach: remove `if (manifest.schema.name !== this._activeSchema.name) throw new SchemaMismatchError(...)`, allowing changes created under different schemas to load cleanly
      (Req: core:change-manifest: Schema version)

- [x] 4.4 Update `ValidateArtifacts` to resolve sovereign schema and remove `SchemaMismatchError`
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidateArtifacts.execute` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` to `schemaProvider.get(...)` and remove the legacy `schema.name() !== change.schemaName` comparison and error
      (Req: core:validate-artifacts: Sovereign schema resolution)

- [x] 4.5 Update `RunStepHooks` to resolve sovereign schema and remove `SchemaMismatchError`
      `packages/core/src/application/use-cases/run-step-hooks.ts`: `RunStepHooks.execute` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` (or `archived.schemaName`) to `schemaProvider.get(...)` and remove the `schema.name() !== change.schemaName` check
      (Req: core:run-step-hooks: Sovereign schema resolution)

- [x] 4.6 Update `PreviewSpec` to resolve sovereign schema and remove `SchemaMismatchError`
      `packages/core/src/application/use-cases/preview-spec.ts`: `PreviewSpec.execute` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` to `schemaProvider.get(...)` and remove the `schema.name() !== change.schemaName` check
      (Req: core:preview-spec: Sovereign schema resolution)

- [x] 4.7 Update `GetStatus` to resolve sovereign schema for active changes and drafts
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus.execute` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` for active changes and `draftView.schemaName` for drafts to `schemaProvider.get(...)`, preserving graceful degradation on resolution failure
      (Req: core:get-status: Graceful degradation when schema resolution fails)

- [x] 4.8 Update `ReconcileChangeValidity` to resolve sovereign schema
      `packages/core/src/application/use-cases/reconcile-change-validity.ts`: `ReconcileChangeValidity._apply` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` to `this._deps.schemaProvider.get(...)`
      (Req: core:transition-checks: Applicability from, to, and along)

- [x] 4.9 Update `ArchiveChange` to resolve sovereign schema
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange.execute` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` to `schemaProvider.get(...)`, ensuring archive predicates and metadata materialization operate on the sovereign schema
      (Req: core:archive-change: Sovereign schema resolution)

- [x] 4.10 Update `ApproveSpec` and `ApproveSignoff` to resolve sovereign schema and remove `SchemaMismatchError`
      `packages/core/src/application/use-cases/approve-spec.ts` and `packages/core/src/application/use-cases/approve-signoff.ts`: `ApproveSpec.execute` and `ApproveSignoff.execute` — resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` to `schemaProvider.get(...)` and remove the legacy `schema.name() !== change.schemaName` guard
      (Req: core:approve-spec: Gate guard, core:approve-signoff: Gate guard)

- [x] 4.11 Update `CompileContext`, `GetArtifactInstruction`, and `GetHookInstructions` to resolve sovereign schema and remove `SchemaMismatchError`
      `packages/core/src/application/use-cases/compile-context.ts`, `packages/core/src/application/use-cases/get-artifact-instruction.ts`, `packages/core/src/application/use-cases/get-hook-instructions.ts`: resolve `SchemaProvider.get(change.schemaName)`
      Approach: pass `change.schemaName` to `schemaProvider.get(...)` and remove the `schema.name() !== change.schemaName` guards
      (Req: core:compile-context: Sovereign schema resolution, core:get-artifact-instruction: Sovereign schema resolution, core:get-hook-instructions: Sovereign schema resolution)

## 5. Transition Change Application Use Case

- [x] 5.1 Resolve sovereign schema and `'next'` target via `WorkflowTopology` in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute` — resolve schema by `change.schemaName` and resolve `'next'` via topology
      Approach: call `const schema = await this._schemaProvider.get(change.schemaName)`; when `to === 'next'`, call `WorkflowTopology.nextForwardStep(fromState, schema, this._approvals)` and throw `HappyPathNextUnavailableError` if null
      (Req: core:transition-change: to next is the happy-path next state)

- [x] 5.2 Implement bypassed step detection and step-skip check execution in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute` — evaluate intermediate bypassed steps
      Approach: call `WorkflowTopology.bypassedSteps(fromState, requestedTarget, schema, this._approvals)`; for each optional bypassed step, evaluate checks registered with `{ scope: 'step-skip', step }`; throw `CheckPredicateFailedError` if any check fails
      (Req: core:transition-change: Bypassed step evaluation and hook suppression)

- [x] 5.3 Suppress hook execution for bypassed steps in `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute` — hook execution scoping
      Approach: ensure hooks execute strictly for `fromState` (`source.post` on forward) and `requestedTarget` (`target.pre`, `target.post`); explicitly do not execute hooks for any bypassed intermediate step
      (Req: core:transition-change: Bypassed step evaluation and hook suppression)

## 6. Lifecycle Engine & Guidance

- [x] 6.1 Update `evaluateLifecycleVerdict` to delegate available steps, transitions, and next hop to `WorkflowTopology`
      `packages/core/src/domain/services/lifecycle-verdict.ts` and `lifecycle-engine.ts`: `evaluateLifecycleVerdict`, `resolveLifecycleNextHop` — topology integration
      Approach: exclude disabled steps from `availableSteps`; compute `availableTransitions` via `WorkflowTopology.legalTransitions`; compute `nextHop.targetStep` via `WorkflowTopology.nextForwardStep`
      (Req: core:lifecycle-engine: Available steps and domain next hop)

- [x] 6.2 Update `verificationBoundary` to respect disabled `verifying` step
      `packages/core/src/domain/services/lifecycle-verdict.ts`: `verificationBoundary` — disable verification requirements when `verifying` is disabled
      Approach: check `WorkflowTopology.isStepEnabled('verifying', schema)`; when false, return false from `verificationBoundary`, allowing changes to progress to `done` or `archivable` without mandatory verification renewal
      (Req: core:lifecycle-engine: Available steps and domain next hop, core:workflow-topology: Step enablement and verification boundary)

- [x] 6.3 Update `lifecycle-guidance.ts` command resolution for disabled intermediate steps
      `packages/core/src/application/services/lifecycle-guidance.ts`: `resolveLifecycleCommand` — topology-aware command routing
      Approach: when intermediate steps are disabled (e.g. `verifying` disabled), resolve `phaseCommand` to `/specd-archive` rather than `/specd-implement`
      (Req: core:lifecycle-engine: Application lifecycle guidance)

## 7. Standard Schema Definition Update

- [x] 7.1 Update `packages/schema-std/schema.yaml` with workflow step definitions
      `packages/schema-std/schema.yaml`: `workflow` section — declare optional and disabled step attributes
      Approach: verify standard steps support `optional` and `disabled` declarations per `@specd/schema-std` specification
      (Req: schema-std:standard-schema: Lifecycle Steps and State Transitions)

## 8. CLI Commands (status & transition)

- [x] 8.1 Update `changes status` to project ordered pipeline, optional annotations, and bypass transitions
      `packages/cli/src/commands/change/status.ts`: `registerChangeStatus` — pipeline display formatting
      Approach: display `availableTransitions` including shortcut/bypass paths from `GetStatus`; annotate optional steps with `[optional]`; exclude disabled steps from `extras` display
      (Req: cli:change-status: Lifecycle projections come from GetStatus checks)

- [x] 8.2 Update `changes transition` to handle topology-resolved `'next'` and report errors cleanly
      `packages/cli/src/commands/change/transition.ts`: `registerChangeTransition` — next-transition resolution
      Approach: pass `to: 'next'` to `TransitionChange.execute` when `--next` is supplied; handle `HappyPathNextUnavailableError` with clear error message and exit code 1
      (Req: cli:change-transition: Next-transition resolution)

## 9. Documentation Updates

- [x] 9.1 Update schema format documentation
      `docs/schemas/schema-format.md`: document `optional` and `disabled` workflow step attributes, bedrock state immutability, and approval anchor locks
      Approach: add section explaining workflow topology configuration in `schema.yaml`
      (Req: default:\_global/docs)

- [x] 9.2 Update workflow guide documentation
      `docs/guide/workflow.md`: document skippable and disabled lifecycle steps, shortcut transitions via `--next`, and step-skip check semantics
      Approach: add examples of workflows with optional `implementing` or disabled `verifying` steps
      (Req: default:\_global/docs)

- [x] 9.3 Update ports documentation
      `docs/core/ports.md`: document `SchemaProvider.get(ref?: string)` sovereign reference resolution contract
      Approach: update port documentation to explain dynamic by-reference schema resolution and caching
      (Req: default:\_global/docs)

## 10. Automated Unit & Integration Tests

- [x] 10.1 Add `WorkflowTopology` unit tests
      `packages/core/test/domain/services/workflow-topology.spec.ts`: test suite for `WorkflowTopology`
      Approach: test `orderedPipeline` (bedrock presence, schema ordering, omitted defaults), invariant validation (bedrock disabled error, approval anchor disabled error, reachability error), `legalTransitions` (shortcuts over optional/disabled), `bypassedSteps`, and `nextForwardStep`
      (Req: core:workflow-topology: Ordered pipeline construction, Graph reachability invariant, Dynamic legal transitions, Bypassed step detection, Topological forward progression, Step enablement and verification boundary)

- [x] 10.2 Add step-skip check and registry unit tests
      `packages/core/test/domain/services/check-registry.spec.ts` and `transition-checks.spec.ts`: tests for step-skip scope and bindings
      Approach: test coordinate uniqueness for `scope: 'step-skip'`, check matching for `StepSkipApplicability`, and `workflowTasksEmpty` pass/fail behavior
      (Req: core:check-registry: Binding coordinate identity and duplicate prevention, core:transition-checks: Step-skip check scope and applicability, Registry bindings for this capability)

- [x] 10.3 Add `TransitionChange` bypass and hook suppression integration tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`: integration tests for shortcut transitions
      Approach: test transitioning across optional steps evaluating step-skip checks, failing when tasks are incomplete, suppressing bypassed pre/post hooks, and resolving sovereign schemas by reference
      (Req: core:transition-change: to next is the happy-path next state, Bypassed step evaluation and hook suppression)

- [x] 10.4 Add `LifecycleEngine` disabled verification tests
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`: tests for disabled verification step
      Approach: test that when `verifying` is disabled, `availableSteps` excludes it, `verificationBoundary` returns false, and next hop recommends `done`/`archivable` without verification evidence
      (Req: core:lifecycle-engine: Available steps and domain next hop, Application lifecycle guidance)

- [x] 10.5 Add CLI `change status` and `change transition` command tests
      `packages/cli/test/commands/change/status.spec.ts` and `transition.spec.ts`: CLI tests for status and transition
      Approach: test status output showing `[optional]` annotations and bypass transitions; test transition `--next` executing shortcut transitions
      (Req: cli:change-status: Lifecycle projections come from GetStatus checks, cli:change-transition: Next-transition resolution)

## 11. Declarative Schema Checks, Governance & Runtime Binding Composition

- [x] 11.1 Add `WorkflowStepSkipCheckDeclaration` and update `WorkflowStep` in domain models
      `packages/core/src/domain/value-objects/workflow-step.ts`: `WorkflowStepSkipCheckDeclaration`, `WorkflowStep` — define check and skip-check interfaces
      Approach: define `WorkflowStepSkipCheckDeclaration` interface (`id`, `onFailure?`, `skippable?`, `disabled?`, `config?`), and add `readonly checks?: readonly WorkflowStepCheckDeclaration[]` and `readonly skipChecks?: readonly WorkflowStepSkipCheckDeclaration[]` to `WorkflowStep`
      (Req: core:workflow-model: Workflow step checks and skip-checks declarations)

- [x] 11.2 Implement `WorkflowStepCheckZodSchema` and `WorkflowStepSkipCheckZodSchema` in schema YAML parser
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `WorkflowStepCheckZodSchema`, `WorkflowStepSkipCheckZodSchema`, and `WorkflowStepZodSchema` — parse check and skipCheck blocks
      Approach: define Zod schemas for checks and skipChecks, and update `WorkflowStepZodSchema` to parse and transform `checks` and `skipChecks` into `WorkflowStepRaw` without stripping
      (Req: core:workflow-model: Workflow step checks and skip-checks declarations)

- [x] 11.3 Enforce two-tier governance locks and semantic validation in `buildSchema`
      `packages/core/src/domain/services/build-schema.ts`: `buildSchema` — validate check existence, coordinate uniqueness, governance locks, and disabled step invariant
      Approach: check that every check `id` exists in the active registry (`UnknownCheckError`), enforce coordinate uniqueness for transition and step-skip coordinates (`DuplicateCheckBindingError`), enforce confinement locks preventing embedding Category A/B checks (`CheckEmbeddingForbiddenError`), enforce policy locks preventing modifying `onFailure`/`skippable` on locked coordinates (`CheckBindingOverrideForbiddenError`), enforce parameter locks preventing config overrides on locked coordinates (`CheckConfigOverrideForbiddenError`), enforce disablement locks preventing `disabled: true` on locked coordinates (`CheckDisableForbiddenError`), and throw `SchemaValidationError` if `skipChecks` are declared on a `disabled: true` step
      (Req: core:workflow-model: Workflow step checks and skip-checks declarations, core:check-registry: Two-tier governance and confinement locks)

- [x] 11.4 Extend `mergeSchemaLayers` to merge `skipChecks` and enforce monotonic governance locks
      `packages/core/src/domain/services/merge-schema-layers.ts`: `mergeSchemaLayers` — aggregate `skipChecks` with identity collision detection
      Approach: in `mergeWorkflowStepOperations`, merge `step.skipChecks` using `addToArray` with identity key `'id'`, ensuring extending layers cannot clobber or erase existing governance locks
      (Req: core:check-registry: Two-tier governance and confinement locks)

- [x] 11.5 Implement pure domain function `resolveEffectiveBindings` with cascaded config resolution
      `packages/core/src/domain/services/transition-checks.ts`: `resolveEffectiveBindings` — compute dynamic effective bindings for target step and bypassed steps
      Approach: overlay `schema.workflowStep(targetStep).checks` onto base transition bindings (filtering `disabled: true`, synthesizing new bindings, cascading config via `deepMergeConfig`), and overlay `schema.workflowStep(S).skipChecks` for each bypassed step `S` (filtering `disabled: true`, synthesizing `scope: 'step-skip'` bindings, cascading config via `deepMergeConfig`)
      (Req: core:transition-checks: Dynamic runtime binding composition and cascaded config resolution)

- [x] 11.6 Integrate dynamic binding composition and hook suppression into `TransitionChange`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute` — evaluate effective transition and step-skip checks
      Approach: resolve sovereign schema via `schemaProvider.get(change.schemaName)`, resolve dynamic effective bindings via `resolveEffectiveBindings`, evaluate matching transition predicates, evaluate matching step-skip checks for bypassed optional steps with fail-fast, and strictly suppress hooks on bypassed steps
      (Req: core:transition-change: Bypassed step evaluation and hook suppression, core:transition-checks: Dynamic runtime binding composition and cascaded config resolution)

- [x] 11.7 Integrate dynamic binding composition into `GetStatus`
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus.execute` — project effective check blockers and available transitions
      Approach: resolve sovereign schema via `schemaProvider.get(change.schemaName)`, resolve effective bindings via `resolveEffectiveBindings` for candidate transitions, and project custom check blockers and status projections cleanly
      (Req: core:transition-checks: Dynamic runtime binding composition and cascaded config resolution, core:get-status: Graceful degradation when schema resolution fails)

## 12. Exhaustive Verification Test Suite

- [x] 12.1 Add schema YAML parser unit tests for `checks` and `skipChecks`
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`: test parsing valid declarations, along enums, onFailure, skippable, disabled, custom config, and rejection of malformed structures
      Approach: verify that `WorkflowStepZodSchema` correctly parses `checks` and `skipChecks` blocks into `WorkflowStepRaw`, and throws `SchemaValidationError` on invalid types or enums
      (Req: core:workflow-model: Workflow step checks and skip-checks declarations)

- [x] 12.2 Add `buildSchema` governance and semantic validation tests
      `packages/core/test/domain/services/build-schema.spec.ts`: test governance rejection contracts
      Approach: test rejection of unknown checks (`UnknownCheckError`), duplicate coordinates (`DuplicateCheckBindingError`), embedding Category A & B checks (`CheckEmbeddingForbiddenError`), modifying locked coordinate policy (`CheckBindingOverrideForbiddenError`), modifying locked config (`CheckConfigOverrideForbiddenError`), disabling locked checks (`CheckDisableForbiddenError`), and declaring `skipChecks` on `disabled: true` step (`SchemaValidationError`)
      (Req: core:workflow-model: Workflow step checks and skip-checks declarations, core:check-registry: Two-tier governance and confinement locks)

- [x] 12.3 Add `mergeSchemaLayers` unit tests for `skipChecks` and monotonic governance locks
      `packages/core/test/domain/services/merge-schema-layers.spec.ts`: test merging `checks` and `skipChecks` across layers
      Approach: test that `mergeSchemaLayers` aggregates `skipChecks` across layers without collisions, rejects duplicate IDs with collision error, and preserves locks monotonically
      (Req: core:check-registry: Two-tier governance and confinement locks)

- [x] 12.4 Add `resolveEffectiveBindings` unit tests
      `packages/core/test/domain/services/transition-checks.spec.ts`: test dynamic binding overlay and config cascading
      Approach: test target step transition overlay, bypassed step-skip overlay, suppression of `disabled: true` checks, and cascaded config resolution with `deepMergeConfig`
      (Req: core:transition-checks: Dynamic runtime binding composition and cascaded config resolution)

- [x] 12.5 Add `TransitionChange` integration tests for custom checks and skip checks with sovereign schema
      `packages/core/test/application/use-cases/transition-change.spec.ts`: integration tests for custom transition checks and skip checks
      Approach: test transition evaluation with schema-declared custom transition checks, skipping optional step with schema-declared `skipChecks`, hook suppression for bypassed steps, `--skip-checks` bypass vs non-skippable rejection, and verifying isolation of sovereign schema from workspace `specd.yaml`
      (Req: core:transition-change: Bypassed step evaluation and hook suppression, core:transition-checks: Dynamic runtime binding composition and cascaded config resolution)

- [x] 12.6 Add CLI integration tests for change status and transition with declarative checks
      `packages/cli/test/commands/change/status.spec.ts` & `packages/cli/test/commands/change/transition.spec.ts`: CLI tests for status and transition
      Approach: test CLI projecting custom check blockers, transitioning with custom checks, and executing shortcut bypasses with custom `skipChecks`
      (Req: cli:change-status: Lifecycle projections come from GetStatus checks, cli:change-transition: Next-transition resolution)

## 13. Full Verification Audit Remediation

- [x] 13.1 Restore protocol-edge exact optional typing
      `packages/core/src/application/checks/protocol-edge.ts`, `packages/core/src/domain/checks/protocol-edge.ts`: omit the `approvals` property when no approval configuration is present instead of passing `undefined`
      Approach: construct the facts object with a conditional spread so the optional key is absent when approvals are unavailable; do not widen the target interface with `undefined`
      (Req: core:transition-checks: Evaluation of a transition attempt)

- [x] 13.2 Remove obsolete hardcoded-topology remnants and redundant types
      `packages/core/src/application/services/execute-matching-predicates.ts`, `packages/core/src/domain/services/lifecycle-verdict.ts`, `packages/core/src/domain/services/transition-checks.ts`: remove unused `VALID_TRANSITIONS`/`isStepPermitted`, redundant unions, and unnecessary assertions without changing behavior
      Approach: delete only unused imports/helpers, retain `WorkflowTopology` as the sole topology source, and narrow values through existing discriminated attempt types rather than casts
      (Req: core:workflow-topology: Single source of truth, core:transition-checks: Applicability from, to, and along)

- [x] 13.3 Complete public API documentation and eliminate unused topology parameters
      `packages/core/src/domain/services/workflow-topology.ts`, `packages/core/src/domain/checks/workflow-tasks-empty.ts`, `packages/core/src/domain/entities/change.ts`: add required JSDoc params/returns and remove or correctly consume unused parameters
      Approach: document every public parameter and return value required by the repository JSDoc rules; remove a parameter only when graph impact confirms no caller contract requires it
      (Req: default:\_global/docs, default:\_global/eslint)

- [x] 13.4 Repair typed test fixtures
      `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts`, `packages/core/test/application/use-cases/transition-change.spec.ts`, `packages/core/test/domain/services/lifecycle-engine.spec.ts`: restore missing imports/types and use contract-valid hook and lifecycle fixture shapes
      Approach: import the canonical public types, build `HookEntry` values through their actual discriminated form, and annotate lifecycle pairs with the full `ChangeState` tuple type to prevent accidental literal narrowing
      (Req: default:\_global/testing, default:\_global/conventions)

- [x] 13.5 Preserve the hook/check failure-policy boundary in tests
      `packages/core/test/domain/services/transition-checks.spec.ts`: replace check-binding `onFailure: 'warn'` fixtures with `collect`, or relocate advisory-failure assertions to hook-entry tests; do not widen `CheckBinding.onFailure` beyond `abort | collect`
      Approach: use `collect` for check-orchestrator accumulation; use `warn` only in `HookEntry`/`RunStepHooks` tests that assert advisory process failures and warnings output
      (Req: core:transition-checks: Binding pipeline phase and failure policy, core:hook-execution-model: Resilient hook failure policy)

- [x] 13.6 Re-run full quality gates and regression suites
      Run Core, CLI, and Skills tests followed by `pnpm lint` and `pnpm typecheck`; all commands must exit zero without suppressions or unsafe casts
      Approach: run package suites first for focused feedback, then repository lint and typecheck; fix root causes rather than adding disables, `any`, or non-semantic casts
      (Req: default:\_global/testing, default:\_global/eslint, default:\_global/continuous-integration)

## 14. Follow-up: Complete Sovereign Schema Authority

- [x] 14.1 Bind EditChange compatibility validation to the loaded change schema
      `packages/core/src/application/use-cases/edit-change.ts`: `EditChange.execute` — replace the unnamed schema lookup used for added-spec compatibility
      Approach: call `this._schemaProvider.get(change.schemaName)` and propagate provider failures before persisting any scope edit; never retry with the workspace default
      (Req: core:edit-change: Sovereign schema resolution)

- [x] 14.2 Bind EditChange mutation-time DAG synchronization to the fresh change schema
      `packages/core/src/application/use-cases/edit-change.ts`: serialized `ChangeRepository.mutate` callback — replace the unnamed schema lookup used by `updateSpecIds`
      Approach: call `this._schemaProvider.get(freshChange.schemaName)` inside the mutation and pass only that schema's artifact DAG to `freshChange.updateSpecIds(...)`
      Historical note: this was applied to the older non-scope mutation branch. Later implementation review established that the active `_executeScopeEdit` path intentionally uses `replaceSpecIds(...)` plus `ctx.reconcileAfter(...)`; task 16.1 records the corrective regression work and this completed history is retained rather than rewritten.
      (Req: core:edit-change: Sovereign schema resolution)

- [x] 14.3 Verify EditChange compatibility uses the sovereign schema and fails atomically
      `packages/core/test/application/use-cases/edit-change.spec.ts`: compatibility scenarios — add observably different sovereign/default schema identities
      Approach: assert the pre-mutation compatibility provider receives `change.schemaName`, acceptance/rejection follows only that schema, and resolution rejection persists no partial scope change; do not require a second direct lookup from the active reconciler-owned mutation path
      (Req: core:edit-change: Sovereign schema resolution)

- [x] 14.4 Bind InvalidateChange target selection to the loaded change schema
      `packages/core/src/application/use-cases/invalidate-change.ts`: `InvalidateChange.execute` — replace its unnamed schema lookup
      Approach: call `this._schemaProvider.get(change.schemaName)` before computing focused, downstream, or global targets; propagate rejection before saving invalidation
      (Req: core:invalidate-change: Sovereign schema resolution)

- [x] 14.5 Verify InvalidateChange uses only the sovereign artifact DAG
      `packages/core/test/application/use-cases/invalidate-change.spec.ts`: target and failure scenarios — give sovereign/default schemas different artifact DAGs
      Approach: assert all target modes use the named schema and provider rejection produces neither repository persistence nor invalidation events
      (Req: core:invalidate-change: Sovereign schema resolution)

- [x] 14.6 Bind StartVerification readiness to the loaded change schema
      `packages/core/src/application/use-cases/start-verification.ts`: `_assertImplementationReady` — replace its unnamed schema lookup
      Approach: call `this._deps.schemaProvider.get(change.schemaName)` before constructing readiness facts; propagate rejection before creating an attempt or audit event
      (Req: core:change: StartVerification sovereign schema resolution)

- [x] 14.7 Verify StartVerification sovereign readiness and failure atomicity
      `packages/core/test/application/use-cases/start-verification.spec.ts`: readiness and error scenarios — make required artifacts/check outcomes differ between schemas
      Approach: assert readiness follows only the named schema and a provider rejection leaves no active attempt or start event
      (Req: core:change: StartVerification sovereign schema resolution)

- [x] 14.8 Bind CountTasks discovery and patterns to the input change schema
      `packages/core/src/application/use-cases/count-tasks.ts`: `CountTasks.execute` — replace its unnamed schema lookup
      Approach: call `this._schemaProvider.get(change.schemaName)` and derive both `hasTasks` artifacts and task patterns exclusively from the returned schema
      (Req: core:count-tasks: Sovereign schema resolution)

- [x] 14.9 Verify CountTasks ignores a different workspace default
      `packages/core/test/application/use-cases/count-tasks.spec.ts`: task discovery, pattern, and error scenarios — use schemas with different task declarations
      Approach: assert counts come only from the named schema and provider rejection propagates without returning fallback counts
      (Req: core:count-tasks: Sovereign schema resolution)

- [x] 14.10 Audit remaining schema-provider lookups and run regression gates
      `packages/core/src/application/use-cases/**` and repository quality commands — confirm unnamed `SchemaProvider.get()` remains only in intentional workspace/spec-level operations
      Approach: inspect all change-bound use cases, then run `pnpm --filter @specd/core test`, `pnpm --filter @specd/cli test`, `pnpm --filter @specd/skills test`, `pnpm lint`, and `pnpm typecheck`; all must exit zero without `any`, unsafe casts, or lint suppression
      (Req: core:workflow-model: sovereign change schema authority, default:\_global/testing, default:\_global/eslint)

## 15. Follow-up: Sovereign Validity Fingerprints

- [x] 15.1 Bind validity fingerprint artifact collection to the supplied change schema
      `packages/core/src/application/services/validity-fingerprint-service.ts`: `ValidityFingerprintService._collectArtifacts(change)` — replace its unnamed schema lookup so approval, verification, sign-off, archive, and reconciliation evidence cannot follow the workspace default
      Approach: call `this._deps.schemaProvider.get(change.schemaName)` once in the shared private collector; retain all public signatures and existing hashing behavior, propagate provider rejection unchanged, and never retry with the default schema
      (Req: core:change: Sovereign schema for validity fingerprints)

- [x] 15.2 Verify every artifact-bearing fingerprint API uses only sovereign non-task artifacts
      `packages/core/test/application/services/validity-fingerprint-service.spec.ts`: `artifactFingerprint`, `specApprovalFingerprint`, and `completeFingerprint` scenarios — make sovereign and default schemas differ in artifact sets and `hasTasks` flags
      Approach: assert each API requests `change.schemaName`, hashes only the sovereign schema's non-task artifacts, and rejects without producing fallback fingerprint evidence when named resolution fails
      (Req: core:change: Sovereign schema for validity fingerprints)

- [x] 15.3 Verify invalidation and fingerprint reconciliation share the same schema authority
      `packages/core/test/application/use-cases/invalidate-change.spec.ts`: sovereign-schema invalidation regression — prevent unnamed schema resolution and exercise the reconciliation path after invalidation
      Approach: use a provider that rejects `get()` without a name; assert both invalidation target selection and validity fingerprint collection request the same `change.schemaName` and complete without cross-schema evidence
      (Req: core:invalidate-change: Sovereign schema resolution, core:change: Sovereign schema for validity fingerprints)

## 16. Follow-up: Preserve Reconciler-Owned Scope Validity

- [x] 16.1 Align the EditChange sovereign-schema regression with the active scope-edit flow
      `packages/core/test/application/use-cases/edit-change.spec.ts`: sovereign compatibility regression and existing approval-preservation scenario — remove the incorrect two-provider-call expectation
      Approach: assert one named compatibility lookup for the active scope edit, retain `replaceSpecIds(...)` plus `ctx.reconcileAfter(...)` as the mutation contract, and keep the existing assertion that a current approval is not prematurely invalidated by `updateSpecIds(...)`
      (Req: core:edit-change: Sovereign schema resolution)

## 17. Verification Follow-up: Propagate Approval-Aware Topology

- [x] 17.1 Make approval gates mandatory across pipeline-derived topology queries
      `packages/core/src/domain/services/workflow-topology.ts`: `orderedPipeline`, `legalTransitions`, `isLegalTransition`, `bypassedSteps`, `nextForwardStep`, and the internal active-pipeline helper — require and thread `ApprovalGates`
      Approach: add `approvals: ApprovalGates` to all five public pipeline-derived methods and the internal helper, preserve `isStepEnabled(step, schema)`, validate disabled approval anchors from the same supplied snapshot, retain canonical order `done → archivable → archiving`, and admit backward/redesign edges only through `VALID_TRANSITIONS[from]`
      (Req: core:workflow-topology: Ordered pipeline construction, Dynamic legal transitions, Bypassed step detection, Topological forward progression)

- [x] 17.2 Propagate approvals through legal-target predicate projection
      `packages/core/src/application/services/execute-matching-predicates.ts`: `executeChecksByLegalTargets` — pass `input.approvals` to `WorkflowTopology.legalTransitions`
      Approach: reuse the existing required approvals input verbatim; do not construct a default or perform a second topology evaluation
      (Req: core:workflow-topology: Dynamic legal transitions)

- [x] 17.3 Propagate approvals through entity transition and protocol-edge validation
      `packages/core/src/domain/entities/change.ts`, `packages/core/src/domain/checks/protocol-edge.ts`: `Change.transition`, `protocol-edge.run` — stop discarding the approval snapshot
      Approach: when a schema is supplied, require the corresponding approvals value at the call boundary and pass it to `WorkflowTopology.isLegalTransition`; keep the schema-less `isValidTransition` fallback unchanged and preserve exact optional object construction for check facts
      (Req: core:workflow-topology: Dynamic legal transitions, core:transition-checks: Evaluation of a transition attempt)

- [x] 17.4 Propagate the normalized approval snapshot throughout lifecycle verdicts and guidance
      `packages/core/src/domain/services/lifecycle-verdict.ts`: `evaluateLifecycleVerdict`, requested-target validation, available-step projection, and `resolveLifecycleNextHop` — pass the single normalized `approvals` value to every topology query
      Approach: normalize omitted configuration once to `{ spec: false, signoff: false }`, then reuse that exact object for `legalTransitions`, `orderedPipeline`, `isLegalTransition`, and `nextForwardStep`; do not leave any pipeline-derived query approval-blind
      (Req: core:workflow-topology: Ordered pipeline construction, Dynamic legal transitions, Topological forward progression)

- [x] 17.5 Propagate configured approvals through transition execution
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute` — pass `this._approvals` to next-target, bypass, and entity-transition topology decisions
      Approach: use the existing injected project approval configuration for `nextForwardStep`, `bypassedSteps`, protocol evaluation context, and the final `change.transition` call so the entire attempt observes one snapshot
      (Req: core:transition-change: Bypassed step evaluation and hook suppression, core:workflow-topology: Bypassed step detection, Topological forward progression)

- [x] 17.6 Update topology unit tests for the corrected API and protocol rules
      `packages/core/test/domain/services/workflow-topology.spec.ts`: all topology describes — add explicit `ApprovalGates` fixtures and new regression scenarios
      Approach: pass approvals to every pipeline-derived call; assert canonical tail ordering, disabled anchor rejection through all query paths, shared approval-snapshot behavior, and absence of backward destinations not admitted by `VALID_TRANSITIONS`
      (Req: core:workflow-topology: Ordered pipeline construction, Dynamic legal transitions, Bypassed step detection, Topological forward progression)

- [x] 17.7 Add caller regressions for approval propagation
      `packages/core/test/application/use-cases/transition-change.spec.ts`, `packages/core/test/composition/use-cases/transition-change.spec.ts`, `packages/core/test/domain/services/lifecycle-engine.spec.ts`, `packages/core/test/domain/services/transition-checks.spec.ts`, and `packages/core/test/application/services/execute-matching-predicates.spec.ts` — verify each caller forwards approvals
      Approach: use contrasting schemas and `{ spec, signoff }` snapshots so omitting approvals changes the result; assert transition `--next`, legal-target projection, protocol-edge checks, lifecycle verdict/guidance, and `Change.transition` all enforce the supplied snapshot
      (Req: core:workflow-topology: Dynamic legal transitions, core:transition-change: Next-transition resolution)

- [x] 17.8 Run focused and repository regression gates
      Core, CLI, Skills, lint, and typecheck commands — prove the required-parameter migration is complete
      Approach: run the focused topology and transition suites first, then `pnpm --filter @specd/core test`, `pnpm --filter @specd/cli test`, `pnpm --filter @specd/skills test`, `pnpm lint`, and `pnpm typecheck`; fix every missing call-site argument without `any`, suppression, or fabricated defaults inside topology
      (Req: default:\_global/testing, default:\_global/eslint, default:\_global/continuous-integration)

## 18. Full-compliance corrective follow-up

- [x] 18.1 Make the design skill consume canonical dynamic routing
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl`: lifecycle entry and ready advancement — read structured `nextAction.command` and `lifecycle.availableTransitions`, route only to an advertised target, and run hooks only for actual visited source/target steps
      Approach: keep diagnostic text status, add the minimum TOON extraction read, refresh before advancement, and hard-stop instead of falling back to a fixed target when routing data is missing or stale
      (Req: skills:workflow-automation: Schema-aware skill routing, scenario: disabled or bypassed step hooks are not executed)

- [x] 18.2 Make the implement skill consume canonical dynamic routing
      `packages/skills/templates/skills/specd-implement/SKILL.md.tpl`: ready entry and implementation exit — replace fixed ready-to-implementing assumptions with `nextAction.command` plus `availableTransitions`
      Approach: preserve task execution and tracking semantics; if implementing is bypassed, do not run implementing hooks and route to the recommended skill without entering the phase
      (Req: skills:workflow-automation: Schema-aware skill routing, scenario: optional implementing is bypassed)

- [x] 18.3 Make the verify skill consume canonical dynamic routing
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`: verification entry and done/archivable advancement — stop encoding `implementing → verifying → done → archivable` as mandatory
      Approach: preserve attempt ownership and Full-mode stops, but choose actual transitions from fresh structured status and never run verifying hooks when verifying is disabled or bypassed
      (Req: skills:workflow-automation: Schema-aware skill routing, scenario: disabled verifying does not execute verifying hooks)

- [x] 18.4 Make the archive skill consume canonical dynamic routing
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`: archive entry — honor the structured next action and advertised transition rather than accepting only a fixed canonical predecessor sequence
      Approach: retain deterministic ArchiveChange ownership and user confirmation; reject stale/unadvertised routes before any archiving hook runs
      (Req: skills:workflow-automation: Schema-aware skill routing)

- [x] 18.5 Synchronize generated lifecycle skills
      `.agents/skills/specd-{design,implement,verify,archive}/SKILL.md`, `.codex/skills/specd-{design,implement,verify,archive}/SKILL.md`: regenerate installed outputs from the four updated templates
      Approach: use the repository skill synchronization command; do not hand-edit generated copies or allow agent-specific protocol drift
      (Req: skills:workflow-automation: Generated skill consistency)

- [x] 18.6 Add generated-protocol assertions for dynamic lifecycle routing
      `packages/skills/test/generated-skill-protocol.spec.ts`: lifecycle skill protocol coverage — assert structured routing consumption and suppression of hooks for bypassed steps across all four skills
      Approach: inspect rendered generated instructions and fail on fixed happy-path tables, unconditional intermediate hooks, or missing `nextAction.command`/`availableTransitions` usage
      (Req: skills:workflow-automation: Schema-aware skill routing)

- [x] 18.7 Add template regressions for disabled verifying and optional implementing
      `packages/skills/test/template-workflow.spec.ts`: schema-specific routing scenarios — prove direct target selection and zero hooks for skipped intermediate states
      Approach: render representative instruction flows for disabled `verifying` and optional `implementing`; assert only the actual source post and target pre hook commands are present
      (Req: skills:workflow-automation: Hook suppression for bypassed steps)

- [x] 18.8 Remove unreachable legacy scope synchronization from EditChange
      `packages/core/src/application/use-cases/edit-change.ts`: `EditChange.execute` non-scope mutation branch — delete the dead `hasSpecChanges` block containing the second schema lookup and `updateSpecIds()`
      Approach: keep scope changes exclusively in `_executeScopeEdit` with `replaceSpecIds()` and `ctx.reconcileAfter()`; leave description/policy-only mutation behavior unchanged
      (Req: core:edit-change: Sovereign schema selection and serialized scope reconciliation)

- [x] 18.9 Prove EditChange reconciliation failure is atomic
      `packages/core/test/application/use-cases/edit-change.spec.ts`: scope reconciliation tests — force `ctx.reconcileAfter()` failure and assert no partially persisted spec scope or competing update path
      Approach: retain the one compatibility lookup assertion and verify the repository-visible change remains at its original scope after rejection
      (Req: core:edit-change: Sovereign schema selection and serialized scope reconciliation)

- [x] 18.10 Add positive sovereign-schema projection coverage for GetStatus
      `packages/core/test/application/use-cases/get-status.spec.ts`: custom/default schema regression — assert `get(change.schemaName)` and that custom workflow/artifact projection wins
      Approach: make the recorded and workspace-default schemas observably different; test the successful path rather than only degraded failure handling
      (Req: core:get-status: Sovereign schema resolution)

- [x] 18.11 Add positive sovereign-schema archive coverage
      `packages/core/test/application/use-cases/archive-change.spec.ts`: successful archive regression — assert the recorded schema is requested and drives archive behavior when the workspace default differs
      Approach: complement the mismatch rejection test with a keyed provider that returns the sovereign schema and permits the archive path
      (Req: core:archive-change: Sovereign schema resolution)

- [x] 18.12 Add sovereign-schema hook-instruction coverage
      `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`: active and archived lookup regressions — prove instructions come from the schema recorded on each change/archive
      Approach: use different hook text in sovereign and default schemas, assert the named provider call and sovereign instruction result for both lookup paths
      (Req: core:get-hook-instructions: Sovereign schema resolution)

- [x] 18.13 Run synchronization and repository regression gates
      Skills and Core focused suites, full Core/CLI/Skills suites, root lint and typecheck — close the compliance findings with executable evidence
      Approach: run skill synchronization first, then focused tests for tasks 18.6–18.12, followed by `pnpm --filter @specd/core test`, `pnpm --filter @specd/cli test`, `pnpm --filter @specd/skills test`, `pnpm lint`, and `pnpm typecheck`; resolve all new implementation tracking entries
      (Req: default:\_global/testing, default:\_global/eslint, default:\_global/continuous-integration)

## 19. Full-audit contract and implementation closure

- [x] 19.1 Align plugin namespace validation with the documented grammar
      packages/core/src/domain/services/check-registry.ts: PLUGIN*NAME_REGEX — accept every non-empty namespace matching ^[a-zA-Z0-9*-]+$.
      Approach: replace the lowercase-leading regex without weakening punctuation rejection.
      (Req: core:check-registry — canonical namespacing and plugin registration)

- [x] 19.2 Cover the complete valid plugin namespace grammar
      packages/core/test/domain/services/check-registry.spec.ts: registration cases — add uppercase, leading-digit, and underscore examples.
      Approach: assert successful canonical registration for each valid form and retain invalid punctuation coverage.
      (Req: core:check-registry, scenario: Plugin namespace accepts the documented grammar)

- [x] 19.3 Delegate transition direction classification to WorkflowTopology
      packages/core/src/domain/services/transition-checks.ts: classifyAlong/buildAxis — remove the local axis builder and accept Schema plus ApprovalGates.
      Approach: preserve special classifications, then derive ordinary indexes exclusively from WorkflowTopology.orderedPipeline(schema, approvals).
      (Req: core:transition-checks — applicability from, to, and along)

- [x] 19.4 Update classifyAlong callers and topology delegation tests
      packages/core/src and packages/core/test: classifyAlong call sites — pass the sovereign schema and exact approval snapshot.
      Approach: update compile sites atomically and add noncanonical-order and approval-snapshot assertions.
      (Req: core:workflow-topology — ordered pipeline construction; core:transition-checks)

- [x] 19.5 Preserve governance locks on synthesized effective bindings
      packages/core/src/domain/services/transition-checks.ts: resolveEffectiveBindings — replace hardcoded true capabilities with registry governance.
      Approach: propagate the most restrictive allowBindingOverride, allowConfigOverride, and allowDisable values in both synthesis branches.
      (Req: core:check-registry — two-tier governance; core:transition-checks — dynamic runtime binding composition)

- [x] 19.6 Test synthesized transition and step-skip governance
      packages/core/test/domain/services/transition-checks.spec.ts: resolveEffectiveBindings cases — assert false locks survive synthesis.
      Approach: register a locked custom check and exercise both target-step and bypassed-step declarations.
      (Req: scenario: Synthesized bindings preserve restrictive governance)

- [x] 19.7 Reject invalid checks.from lifecycle names
      packages/core/src/infrastructure/schema-yaml-parser.ts and packages/core/src/domain/services/build-schema.ts: workflow check validation — permit only '\*' or ChangeState.
      Approach: validate at parse/build boundary and throw the existing typed schema-validation error family before runtime matching.
      (Req: core:workflow-model — workflow step checks and skip-checks declarations)

- [x] 19.8 Test invalid checks.from declarations
      packages/core/test/infrastructure/schema-yaml-parser.spec.ts and/or packages/core/test/domain/services/build-schema.spec.ts: malformed source state case.
      Approach: provide an unknown lifecycle name and assert typed rejection with the offending value.
      (Req: scenario: Unknown checks from state is rejected)

- [x] 19.9 Remove legacy bypass aliases from TransitionChangeInput
      packages/core/src/application/use-cases/transition-change.ts: TransitionChangeInput and execute — remove allowOutOfScope, allowOverlap, and their translation branches.
      Approach: retain only skipChecks in Core; keep legacy CLI flag translation at the adapter boundary.
      (Req: core:transition-change — Input contract)

- [x] 19.10 Prove the Core input contract excludes legacy aliases
      packages/core/test/application/use-cases/transition-change.spec.ts and compile fixtures — remove alias calls and assert uniform skipChecks behavior.
      Approach: use type-level or compile assertions plus runtime coverage for skipChecks.
      (Req: scenario: Legacy boolean flags omitted from input)

- [x] 19.11 Make EditChange atomicity test reach post-mutation reconciliation
      packages/core/test/application/use-cases/edit-change.spec.ts: keeps the persisted scope atomic when reconciliation rejects — invoke the mutate callback, run replaceSpecIds, then reject from reconcileAfter.
      Approach: use a transaction-faithful reconciler fixture and assert persisted IDs, history, artifacts, and validity are unchanged.
      (Req: core:edit-change — sovereign schema resolution)

- [x] 19.12 Replace fixed lifecycle skill targets with actualTarget routing
      packages/skills/templates/skills/specd-design/SKILL.md.tpl, specd-implement/SKILL.md.tpl, specd-verify/SKILL.md.tpl, specd-archive/SKILL.md.tpl — make operational recipes derive targets and hooks from fresh structured status.
      Approach: bind actualTarget from nextAction/availableTransitions, conditionalize canonical examples, and never select hooks for bypassed steps.
      (Req: skills:workflow-automation — cross-skill artifact review and recovery)

- [x] 19.13 Add behavioral routing regressions for disabled and optional steps
      packages/skills/test/template-workflow.spec.ts and generated-skill-protocol.spec.ts — model disabled verifying and optional implementing routes.
      Approach: assert actual-target hooks are selected, skipped-step hooks are absent, and unconditional canonical recipes fail.
      (Req: scenarios: Disabled verifying selects only the actual target hooks; Optional implementing bypass follows status routing)

- [x] 19.14 Synchronize generated lifecycle skills
      .agents/skills and .codex/skills generated copies — regenerate all four lifecycle skills from templates.
      Approach: run pnpm ai-agents:sync and verify exact source/generated protocol parity.
      (Req: skills:workflow-automation)

- [x] 19.15 Run focused and repository-wide validation
      Core, CLI, Skills, lint, and typecheck suites — validate every corrective scenario and all regressions.
      Approach: run focused affected suites, then pnpm test, pnpm lint, and pnpm typecheck; require zero failures.
      (Req: all corrective verification scenarios)

## 20. Optional-path recommendation and documentation

- [x] 20.1 Implement Core-owned optional-path recommendation
      packages/core/src/domain/services/lifecycle-verdict.ts: recommendedForwardTarget and resolveLifecycleNextHop — choose the preferred checked shortcut instead of blindly using nextForwardStep.
      Approach: traverse orderedPipeline, bypass consecutive optional steps only when the corresponding target survives in availableTransitions, otherwise enter the closest optional step.
      (Req: core:lifecycle-engine — Available steps and domain next hop)

- [x] 20.2 Keep lifecycle guidance aligned with the selected target
      packages/core/src/application/services/lifecycle-guidance.ts: resolveLifecycleCommand/phaseCommand — map nextHop.targetStep without recomputing a different topology target.
      Approach: treat the domain recommendation as authoritative and preserve human approval/review routes.
      (Req: core:lifecycle-engine — Application lifecycle guidance)

- [x] 20.3 Test optional-path recommendation policy
      packages/core/test/domain/services/lifecycle-verdict.spec.ts: next-hop scenarios — cover mandatory successor, passing/failing skip checks, empty effective check set, and consecutive optional steps.
      Approach: make availableTransitions observably differ per predicate result and assert both recommended target and retained explicit alternatives.
      (Req: optional-step recommendation scenarios)

- [x] 20.4 Clarify custom-schema optional and disabled examples
      docs/guide/custom-schemas.md and docs/guide/schemas.md — replace ambiguous comments with the four-case semantics table and conditional/unconditional examples.
      Approach: explain registry-provided bindings, schema skipChecks, and that skills never choose the path.
      (Req: core:workflow-model — authority boundary)

- [x] 20.5 Document runtime skip-check and recommendation semantics
      docs/guide/workflow.md, docs/core/custom-checks.md, and docs/schemas/schema-format.md — document effective check composition and Core fallback/recommendation behavior.
      Approach: show passing, failing, empty-set, consecutive-optional, and disabled flows with concrete YAML and status outcomes.
      (Req: core:transition-change — bypassed step evaluation; core:lifecycle-engine)

- [x] 20.6 Regenerate and verify published guide content
      packages/guide/src/infrastructure/generated/guides.ts and relevant guide tests — synchronize generated documentation and guard key semantics.
      Approach: use the repository guide generation command, then assert generated custom-schemas/workflow content contains the authority and empty-set rules.
      (Req: documentation contract)

## 21. Verification-attempt-8 follow-up

- [x] 21.1 Normalize explicitly declared bedrock positions
      `packages/core/src/domain/services/workflow-topology.ts`: `rawActivePipeline` — prevent author ordering of bedrock rows from changing the lifecycle axis
      Approach: remove bedrock names from the declared delivery list, compose the configurable delivery segment while preserving its declared relative order, then wrap it with `drafting`, `designing`, `archivable`, and `archiving` in canonical order; retain declaration metadata and existing validation
      (Req: core:workflow-topology: Ordered pipeline construction)

- [x] 21.2 Add topology ordering regressions
      `packages/core/test/domain/services/workflow-topology.spec.ts`: `orderedPipeline` cases — cover noncanonical explicit bedrock declarations and noncanonical configurable delivery order
      Approach: assert bedrock normalization, preservation of configurable-row relative order, and stable direction/next-step behavior from the resulting axis
      (Req: core:workflow-topology: Ordered pipeline construction; scenarios: canonical anchors)

- [x] 21.3 Prove `--next` enters the nearest enabled optional step
      `packages/cli/test/commands/change-transition.spec.ts`: next-resolution cases — distinguish optional successors from disabled successors
      Approach: use an optional `implementing` schema whose effective skip checks pass or are empty and assert `--next` still targets `implementing`; retain disabled-`verifying` coverage that resolves directly to `done`
      (Req: cli:change-transition: Next-transition resolution)

- [x] 21.4 Align the archive mismatch fixture with sovereign-schema terminology
      `packages/core/test/application/use-cases/archive-change.spec.ts`: legacy mismatch describe/test names — describe a provider returning an identity inconsistent with the requested recorded schema
      Approach: preserve the rejection assertion and no-peer-listing behavior, but remove wording that implies ArchiveChange compares against the workspace default
      (Req: core:archive-change: Sovereign schema resolution)

- [x] 21.5 Run focused corrective tests
      Core topology/archive and CLI transition suites — prove all verification-attempt-8 findings are closed
      Approach: run the focused Vitest files for tasks 21.1–21.4 and require zero failures before broad validation
      (Req: default:\_global/testing)

- [x] 21.6 Run repository validation gates
      Core, CLI, Skills, Guide, lint, and typecheck suites — ensure the corrected contracts and implementation introduce no regressions
      Approach: execute the same full verification matrix used by attempt 8 and require zero failures before returning to verification
      (Req: all corrective verification scenarios)

## 22. Verification-attempt-9 schema-authority reconciliation

- [x] 22.1 Reconfirm workspace-default mismatch loading behavior
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: sovereign-schema hydration regression — prove a persisted change remains loadable when the current workspace default has another schema name
      Approach: keep the recorded manifest schema authoritative, assert no `SchemaMismatchError`, and ensure the fixture does not model a provider returning the wrong identity
      (Req: core:change — Schema version; scenario: Different workspace default does not reject an existing change)

- [x] 22.2 Reconfirm provider-identity mismatch rejection
      `packages/core/test/application/use-cases/archive-change.spec.ts`: sovereign lookup integrity fixture — prove a schema provider returning an identity different from the explicitly requested `change.schemaName` is rejected before archive behavior consumes it
      Approach: preserve the negative `SchemaMismatchError` assertion and describe it as provider-integrity failure, distinct from workspace-default isolation
      (Req: core:change — Schema version; scenario: Provider identity mismatch throws SchemaMismatchError)

- [x] 22.3 Run the schema-authority regression matrix
      Core repository, archive, change-bound use-case, and fingerprint suites — validate the reconciled contract without changing correct sovereign-schema behavior
      Approach: run focused sovereign/default fixtures, then the Core suite, lint, and typecheck; require zero failures and no unnamed fallback lookup for an existing change
      (Req: core:change — Schema version, StartVerification sovereign schema resolution, Sovereign schema for validity fingerprints)

## 23. Verification-attempt-10 shared schema resolution follow-up

- [x] 23.1 Add the provider identity mismatch error
      `packages/core/src/application/errors/schema-provider-identity-mismatch-error.ts`: `SchemaProviderIdentityMismatchError` — add the typed provider-contract failure with code `SCHEMA_PROVIDER_IDENTITY_MISMATCH` and expected/actual names
      Approach: extend `SpecdError`, use the exact constructor fields and message in design, and export it through application/error/Core public barrels while retaining the legacy error export for compatibility
      (Req: core:resolve-change-schema — Provider identity integrity)

- [x] 23.2 Implement the shared change-schema resolver
      `packages/core/src/application/services/resolve-change-schema.ts`: `ResolveChangeSchema.execute` — perform the sole trusted named lookup for a change
      Approach: call `SchemaProvider.get(schemaName)` exactly once, throw the typed identity error on a returned-name mismatch, emit a structured advisory for same-name version drift, and never consult the workspace default
      (Req: core:resolve-change-schema — Sovereign named lookup, Same-name version advisory)

- [x] 23.3 Test resolver lookup, identity, version, and failure contracts
      `packages/core/test/application/services/resolve-change-schema.spec.ts`: new resolver suite — cover exact match, different default isolation, missing schema, wrong identity, and same-name version drift
      Approach: use a keyed provider that rejects unnamed calls; assert one named call, exact error propagation, one warning for version drift, and a usable returned schema
      (Req: core:resolve-change-schema — Input and result, Failure and caller policy; all resolver scenarios)

- [x] 23.4 Wire one resolver instance through Core composition
      `packages/core/src/composition/kernel.ts`, composition resolver/factory modules, and service barrels — construct and inject `ResolveChangeSchema` for every change-bound consumer
      Approach: create it from the existing `SchemaProvider` once per kernel, add typed dependency fields to factories, preserve existing public operation inputs, and avoid per-use-case ad hoc reconstruction
      (Req: core:resolve-change-schema — Shared composition boundary)

- [x] 23.5 Migrate lifecycle status and transition consumers
      `packages/core/src/application/use-cases/get-status.ts` and `transition-change.ts`: schema acquisition — replace direct provider access with `ResolveChangeSchema.execute`
      Approach: pass the loaded change/view name, recorded schema name, and version; keep transition failures throwing and handle read-only status degradation only in `GetStatus`
      (Req: core:get-status — Graceful degradation; core:transition-change — Bypassed step evaluation)

- [x] 23.6 Migrate instruction lookup consumers
      `packages/core/src/application/use-cases/get-hook-instructions.ts` and `get-artifact-instruction.ts`: schema acquisition — use the shared resolver for active and archived change views
      Approach: remove direct identity checks and unnamed fallback paths; let typed resolution failures propagate before instruction or hook selection
      (Req: core:get-hook-instructions — Schema name guard; core:get-artifact-instruction — Schema name guard)

- [x] 23.7 Migrate task, invalidation, and edit consumers
      `packages/core/src/application/use-cases/count-tasks.ts`, `invalidate-change.ts`, and `edit-change.ts`: schema acquisition — use the shared resolver
      Approach: resolve before direct schema-dependent work, preserve serialized reconciliation ownership in `EditChange`, and ensure resolution failure precedes counts, invalidation persistence, or scope mutation
      (Req: core:count-tasks — Sovereign schema resolution; core:invalidate-change — Sovereign schema resolution; core:edit-change — Sovereign schema resolution)

- [x] 23.8 Migrate preview, validation, and context consumers
      `packages/core/src/application/use-cases/preview-spec.ts`, `validate-artifacts.ts`, and `compile-context.ts`: schema acquisition — use the shared resolver
      Approach: consume only the returned trusted schema for parser, artifact, validation, and instruction decisions; remove duplicate local identity guards
      (Req: core:preview-spec — Schema name guard; core:validate-artifacts — Schema name guard; core:compile-context — Schema name guard)

- [x] 23.9 Migrate archive, hook, and approval consumers
      `packages/core/src/application/use-cases/archive-change.ts`, `run-step-hooks.ts`, `approve-spec.ts`, and `approve-signoff.ts`: schema acquisition — use the shared resolver
      Approach: fail before preflight, hooks, or approval mutation; replace archive's legacy mismatch assertion with `SchemaProviderIdentityMismatchError`
      (Req: core:archive-change — Schema name guard; core:run-step-hooks — Schema name guard; core:approve-spec — Gate guard; core:approve-signoff — Gate guard)

- [x] 23.10 Migrate verification and fingerprint consumers
      `packages/core/src/application/use-cases/start-verification.ts` and `packages/core/src/application/services/validity-fingerprint-service.ts`: schema acquisition — use the shared resolver
      Approach: resolve before attempt creation or artifact collection, propagate failure atomically, and derive every fingerprint solely from sovereign non-task artifacts
      (Req: core:change — StartVerification sovereign schema resolution, Sovereign schema for validity fingerprints)

- [x] 23.11 Add cross-consumer resolver regressions
      Focused Core use-case and service specs for tasks 23.5–23.10 — prove shared named lookup and failure atomicity
      Approach: use observably different sovereign/default schemas, reject unnamed provider calls, assert the typed wrong-identity error for mutations, and assert no partial state or fallback output
      (Req: core:resolve-change-schema — Composition and caller policy; all sovereign-schema consumer scenarios)

## 24. Verification-attempt-10 shared transition candidate follow-up

- [x] 24.1 Implement the pure shared candidate evaluator
      `packages/core/src/application/services/evaluate-transition-candidate.ts`: `evaluateTransitionCandidate` and its input/result interfaces — return one complete predicate verdict per target
      Approach: validate normal target predicates, derive bypassed steps through `WorkflowTopology`, compose bindings once, evaluate every bypassed step's effective `step-skip` predicates in order, treat an empty set as pass, and perform no effects or persistence
      (Req: core:transition-checks — Shared transition candidate evaluator)

- [x] 24.2 Unit-test complete candidate evaluation
      `packages/core/test/application/services/evaluate-transition-candidate.spec.ts`: new suite — cover normal predicates, one and multiple bypassed steps, failed skip predicate, empty skip set, and deterministic result ordering
      Approach: spy on effect/hook/mutation collaborators to prove they are never invoked and assert `allowed` changes only on failed predicate results
      (Req: core:transition-checks — Shared transition candidate evaluator; all shared-evaluator scenarios)

- [x] 24.3 Route legal-target status evaluation through the shared evaluator
      `packages/core/src/application/services/execute-matching-predicates.ts`: `executeChecksByLegalTargets` — replace normal-only target evaluation with `evaluateTransitionCandidate`
      Approach: build `checksByTarget` from the complete returned checks for every protocol-legal target so lifecycle projection never reconstructs bypass policy from topology alone
      (Req: core:get-status — Shared transition candidate evaluation; core:lifecycle-engine — Available steps and domain next hop)

- [x] 24.4 Project fail-closed schema resolution status
      `packages/core/src/application/use-cases/get-status.ts`: resolver failure branch — distinguish general failure from provider identity mismatch
      Approach: emit `SCHEMA_RESOLUTION_FAILED` or `SCHEMA_IDENTITY_MISMATCH`, clear `validTransitions`, `availableTransitions`, and candidate rows, set schema-derived fields to null, and never build `nextAction` from an untrusted schema
      (Req: core:get-status — Graceful degradation when schema resolution fails)

- [x] 24.5 Make TransitionChange reevaluate the shared candidate from fresh state
      `packages/core/src/application/use-cases/transition-change.ts`: `execute` predicate phase — invoke `evaluateTransitionCandidate` after reconciliation and fresh reload
      Approach: ignore any prior status authorization, throw `CheckPredicateFailedError` on the fresh failed verdict, and begin effects, hooks, aggregate transition, and persistence only after `allowed` is true
      (Req: core:transition-change — Bypassed step evaluation and hook suppression)

- [x] 24.6 Test GetStatus candidate parity and degradation
      `packages/core/test/application/use-cases/get-status.spec.ts`: candidate and resolution scenarios — cover passing, failing, and empty bypass sets plus both schema blocker codes
      Approach: assert complete `checksByTarget`, exact available transitions, empty transition arrays on failure, and absence of topology/action projection from a wrong-identity schema
      (Req: core:get-status — Shared transition candidate evaluation; Graceful degradation)

- [x] 24.7 Test transition freshness and effects ownership
      `packages/core/test/application/use-cases/transition-change.spec.ts`: stale-status and failure-order scenarios — change predicate facts after status projection
      Approach: assert the transition reevaluates and rejects stale permission, with zero hooks/mutation/save on failure and normal effects only after a passing complete verdict
      (Req: core:transition-change — Freshness and Ownership; scenarios: stale transition, effects after pass)

- [x] 24.8 Test lifecycle checksByTarget completeness and alternatives
      `packages/core/test/domain/services/lifecycle-verdict.spec.ts` and lifecycle evaluation tests — cover failed step-skip evidence and non-recommended advertised targets
      Approach: assert a failed skip result remains in `checksByTarget` while its shortcut is unavailable, and that `designing` remains selectable when advertised even if another `nextAction` is preferred
      (Req: core:lifecycle-engine — Available steps and domain next hop)

## 25. Verification-attempt-10 mandatory done follow-up

- [x] 25.1 Make done unconditional topology bedrock
      `packages/core/src/domain/services/workflow-topology.ts`, `workflow-step.ts`, and schema construction validation — reject optional or disabled `done`
      Approach: include `done` in the normalized bedrock tail between configurable delivery and `archivable`, require reachability through it, and keep only `ready` conditional on the spec approval gate
      (Req: core:workflow-model — Optional and disabled step declarations; core:workflow-topology — Ordered pipeline construction)

- [x] 25.2 Keep signoff as a check on done-to-archivable
      approval signoff check/binding and standard schema lifecycle configuration — skip the predicate when signoff is off without changing topology
      Approach: preserve `done` as completion/retry/signoff boundary and return `skip` from `approval.signoff` for `done -> archivable` when disabled
      (Req: schema-std:standard-schema — Lifecycle Steps and State Transitions; core:workflow-model — Completion Boundary)

- [x] 25.3 Add mandatory-done topology and schema tests
      `packages/core/test/domain/services/workflow-topology.spec.ts`, build-schema/parser tests, and standard-schema tests — cover optional/disabled done with signoff on and off
      Approach: assert `SchemaValidationError` for either flag, canonical `done -> archivable -> archiving` order, and signoff-off check skip without bypassing done
      (Req: core:workflow-topology — Graph reachability invariant; scenarios: Done is mandatory)

## 26. Verification-attempt-10 explicit skill routing follow-up

- [x] 26.1 Make nextAction a preference in lifecycle templates
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl`, `specd-implement/SKILL.md.tpl`, `specd-verify/SKILL.md.tpl`, and `specd-archive/SKILL.md.tpl`: routing entry protocol — permit valid explicit alternatives
      Approach: follow `nextAction` by default; for explicit invocation map the skill to its intended target, report a different recommendation, continue only if the target is in `availableTransitions`, and otherwise stop before hooks with blockers
      (Req: skills:workflow-automation — Cross-skill artifact review and recovery)

- [x] 26.2 Add semantic generated-guide routing tests
      `packages/skills/test/generated-skill-protocol.spec.ts` and `template-workflow.spec.ts`: rendered protocol fixtures — validate behavior rather than literal wording
      Approach: cover passing/failing/empty optional bypass, disabled intermediate hooks, explicit design with another recommendation, unavailable explicit target, and mandatory done with signoff off
      (Req: skills:workflow-automation; scenario: Generated lifecycle guides preserve semantic routing invariants)

- [x] 26.3 Synchronize generated lifecycle skills
      `.agents/skills/specd-{design,implement,verify,archive}/SKILL.md` and `.codex/skills/specd-{design,implement,verify,archive}/SKILL.md`: generated copies — regenerate from the corrected templates
      Approach: run the repository agent-skill synchronization command and assert source/generated parity; do not hand-edit divergent copies
      (Req: skills:workflow-automation — Dynamic topology consumption)

- [x] 26.4 Update and regenerate workflow documentation
      `docs/guide/custom-schemas.md`, `docs/guide/schemas.md`, `docs/guide/workflow.md`, `docs/core/custom-checks.md`, `docs/schemas/schema-format.md`, and generated guides — align user-facing semantics
      Approach: document optional passing/failing/empty-set behavior, disabled omission, mandatory done, Core-owned recommendation, and explicit advertised alternatives; regenerate the guide bundle
      (Req: documentation contract; core:workflow-model — Authority Boundary)

## 27. Verification-attempt-10 validation gates

- [x] 27.1 Run focused corrective suites
      Resolver, candidate evaluator, GetStatus, TransitionChange, topology, schema builder, lifecycle verdict, archive, and skill protocol test files — prove each follow-up contract independently
      Approach: run the exact focused suites named in design and require zero failures before broad validation
      (Req: all verification-attempt-10 scenarios; default:\_global/testing)

- [x] 27.2 Run generated-content consistency checks
      Agent skills and guide generated outputs — verify templates/docs match checked-in generated artifacts
      Approach: rerun both generation commands and require a clean diff for generated files before final verification
      (Req: skills:workflow-automation; documentation contract)

- [x] 27.3 Run full repository quality gates
      Core, CLI, Skills, schema-std, lint, and typecheck — validate the complete change and its cross-workspace fan-out
      Approach: run `pnpm --filter @specd/core test`, CLI/Skills/schema-std tests, `pnpm lint`, and `pnpm typecheck`; require zero failures and no new suppression, `any`, unsafe assertion, or default export
      (Req: all corrective requirements; default:\_global/architecture, conventions, testing)

- [x] 27.4 Perform the manual lifecycle E2E matrix
      Temporary schema/change fixture described in design — verify optional implementing, disabled verifying, signoff off, differing workspace default, stale candidate rejection, explicit redesign, and wrong provider identity
      Approach: inspect structured status and transitions step by step; require lifecycle entry into `done`, archive readiness only after `done -> archivable`, and fail-closed identity mismatch behavior
      (Req: all end-to-end verification scenarios)

## 28. Verification-attempt-11 follow-up: workflow-topology module

- [x] 28.1 Replace the `WorkflowTopology` class with exported workflow functions
      `packages/core/src/domain/services/workflow-topology.ts`: `WorkflowTopology` — convert to `resolveWorkflowPipeline`, `isWorkflowStepEnabled`, `listWorkflowTransitions`, `isWorkflowTransitionLegal`, `listBypassedWorkflowSteps`, `nextWorkflowStep`
      Approach: plain named exports; keep `ApprovalGates` and `PipelineStep` types; helpers `buildActivePipeline`, `forwardTargets`, `isDrainState` stay module-private
      (Req: core:workflow-topology — Module of pure workflow functions)
- [x] 28.2 Build the pipeline in canonical order regardless of row order
      `workflow-topology.ts`: `buildActivePipeline` — iterate the fixed `CANONICAL_PIPELINE` array, attaching row properties from a `Map` keyed by step
      Approach: never read `schema.workflow()` order for positions; bedrock/anchor validation unchanged; filter disabled steps last
      (Req: core:workflow-topology — Ordered pipeline construction; core:workflow-model — Workflow array order is not significant)
- [x] 28.3 Remove the reachability guard
      `workflow-topology.ts`: `isReachable` and its call in `orderedPipeline` — delete
      Approach: connectivity holds by construction (bedrock cannot be disabled, disabled steps removed)
      (Req: core:workflow-topology — Forward connectivity by construction)
- [x] 28.4 Admit `VALID_TRANSITIONS` edges only as true backward/redesign/recovery/drain moves
      `workflow-topology.ts`: `listWorkflowTransitions` — forward targets from `forwardTargets`; extra `VALID_TRANSITIONS[from]` entries only when `designing`, `archiving→archivable`, destination index < source index, or a drain exit of that exact source
      Approach: a forward `VALID_TRANSITIONS` edge absent from `forwardTargets` is rejected (fixes reorder skip of `ready`/`implementing`)
      (Req: core:workflow-topology — Dynamic legal transitions)
- [x] 28.5 Stop normalizing drain states onto pipeline positions
      `workflow-topology.ts`: `normalizeDeliveryState` usage — drain states return `VALID_TRANSITIONS[from]` filtered by enablement; `nextWorkflowStep` returns `null` for `pending-spec-approval`/`pending-signoff`, the step after `ready` for `spec-approved`, `archivable` for `signed-off`
      Approach: removes `pending-signoff → archivable` and `pending-spec-approval → implementing` shortcuts
      (Req: core:workflow-topology — Dynamic legal transitions, Topological forward progression)
- [x] 28.6 Migrate topology call sites to the new functions
      `evaluate-transition-candidate.ts`, `execute-matching-predicates.ts`, `transition-change.ts`, `protocol-edge.ts`, `change.ts`, `lifecycle-verdict.ts`, `transition-checks.ts`, `domain/services/index.ts` — import functions by name
      Approach: mechanical rename; `index.ts` re-exports the six functions and two types, no `WorkflowTopology`
      (Req: core:workflow-topology — Module of pure workflow functions)
- [x] 28.7 Validate the `ready` approval anchor at schema resolve/validate time
      `packages/core/src/application/use-cases/resolve-schema.ts`, `validate-schema.ts` — call `resolveWorkflowPipeline(schema, approvals)` after building
      Approach: surfaces `SchemaValidationError` for disabled `ready` with spec gate on during `schema validate` and every resolution
      (Req: core:workflow-model — Optional and disabled step declarations, Approval Anchor)
- [x] 28.8 Rename topology references in docs and regenerate guides
      `docs/schemas/schema-format.md`, `docs/guide/workflow.md`, `packages/guide/src/infrastructure/generated/guides.ts` — new function names, canonical order, no reachability error
      Approach: edit docs, rerun the guide generation build, commit regenerated output
      (Req: core:workflow-topology — Module of pure workflow functions)
- [x] 28.9 Rewrite topology unit tests
      `packages/core/test/domain/services/workflow-topology.spec.ts` — shuffled rows normalize silently; reordered rows cannot reach `verifying`/`done` early; all delivery steps disabled stays connected; drain states have no shortcuts; disabled source returns `[]`; `nextWorkflowStep` enters optional steps
      Approach: remove "preserves declared delivery order" and reachability tests; use the new function imports
      (Req: core:workflow-topology — all requirements)

## 29. Verification-attempt-11 follow-up: schema build validation

- [x] 29.1 Reject drain-state workflow rows
      `packages/core/src/domain/services/build-schema.ts`: workflow row validation (~line 714) — throw `SchemaValidationError` for `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`
      Approach: message `Workflow step '<s>' is a drain-only state and cannot be declared`
      (Req: core:workflow-model — Step names reference domain lifecycle states)
- [x] 29.2 Reject non-artifact entries in `requires` / `requiresTaskCompletion`
      `build-schema.ts`: workflow requires validation — every entry must be a declared artifact ID
      Approach: message `Workflow step '<s>' requires unknown artifact '<id>'`
      (Req: core:workflow-model — Step requires reference artifact IDs)
- [x] 29.3 Let check-level confinement allow policy changes at its own coordinates
      `build-schema.ts`: `allowBindingOverride` evaluation — at a declared default coordinate use the coordinate binding's lock, not the check-level flag
      Approach: check-level `false` only blocks embedding at new coordinates
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 29.4 Add build-schema tests for 29.1–29.3
      `packages/core/test/domain/services/build-schema.spec.ts`
      Approach: one test per rule plus a positive case
      (Req: core:workflow-model; core:check-registry)

## 30. Verification-attempt-11 follow-up: check pipeline correctness

- [x] 30.1 Compute effective config once in binding resolution
      `packages/core/src/domain/services/transition-checks.ts`: `resolveEffectiveBindings` (~lines 573-579, 725) — store `effectiveConfig` on the resolved `CheckBinding`
      Approach: `deepMergeConfig(deepMergeConfig(gov.defaultConfig, binding.config), stepConfig)` once; add optional `readonly effectiveConfig` to `CheckBinding`
      (Req: core:transition-checks — Dynamic runtime binding composition, Single-pass config cascade)
- [x] 30.2 Stop re-merging config in the predicate executor
      `packages/core/src/application/services/execute-matching-predicates.ts` (~lines 209-220) — pass `binding.effectiveConfig` unchanged; fallback merges check default + binding once; never merge `stepDecl.config`
      Approach: removes array duplication
      (Req: core:transition-checks — Single-pass config cascade)
- [x] 30.3 Isolate transition and step-skip coordinates
      `transition-checks.ts`: `resolveEffectiveBindings` (~lines 607, 671) — key overlays by `(checkId, scope, to|step)`; clone shared bindings per applicability
      Approach: a `disabled` declaration filters only its own key
      (Req: core:transition-checks — Coordinate isolation)
- [x] 30.4 Make step-declared checks honor `from` and `along`
      `execute-matching-predicates.ts` fallback loop (~lines 242-285) — build applicability with `from ?? '*'`, `along ?? 'forward'` and evaluate via `checkMatches`
      Approach: non-matching declarations are not executed
      (Req: core:transition-checks — Applicability of step checks)
- [x] 30.5 Add execute-mode protocol fail-fast to the candidate evaluator
      `packages/core/src/application/services/evaluate-transition-candidate.ts`: `TransitionCandidateEvaluationInput` — add required `mode: 'projection' | 'execute'`; in execute, evaluate `protocol.edge` first and return early on fail
      Approach: `GetStatus` passes `'projection'`, `TransitionChange` passes `'execute'`
      (Req: core:transition-checks — Shared transition candidate evaluator; core:transition-change — Canonical pre-transition validity reconciliation)
- [x] 30.6 Aggregate `onFailure: 'collect'` failures
      `packages/core/src/application/use-cases/transition-change.ts`: `_mapFailedPredicate` caller — throw one `CheckPredicateFailedError` whose `details.failures` lists all collected failures
      Approach: canonical-reason checks stay `abort`
      (Req: core:transition-change — Shared runner errors propagate on transition)
- [x] 30.7 Declare governance explicitly on built-in binding specs
      `packages/core/src/domain/services/check-bindings.ts` — every transition, archive, and step-skip spec declares `allowBindingOverride` and `allowDisable`
      Approach: Category A/B `false`/`false`; Category C `true`/`true`
      (Req: core:transition-checks — Registry bindings for this capability)
- [x] 30.8 Inherit governance instead of defaulting to permissive
      `transition-checks.ts`: `applyBindingSpecs` (~line 517) — `spec.allowBindingOverride ?? governance?.allowBindingOverride ?? false`, same for `allowDisable`
      Approach: no `?? true`
      (Req: core:transition-checks — Registry bindings for this capability)
- [x] 30.9 Forward plugin `allowDisable` in composition
      `packages/core/src/composition/composition-registries.ts` (~lines 223-231) — add `allowDisable` to `PluginCheckRegistrationOptions`
      Approach: `reg.allowDisable ?? reg.options?.allowDisable`
      (Req: core:check-registry — Registration fidelity through composition)
- [x] 30.10 Evaluate plugin step-skip default bindings
      `packages/core/src/composition/use-cases/workflow-check-registry.ts` (~lines 74-85) — collect custom `step-skip` bindings as `stepSkipBindings`; pass into `resolveEffectiveBindings` from `TransitionChange` and `GetStatus`
      Approach: treated exactly like built-in step-skip bindings
      (Req: core:check-registry — Registration fidelity through composition)
- [x] 30.11 Add check-pipeline tests
      `execute-matching-predicates.spec.ts`, `transition-checks.spec.ts`, `evaluate-transition-candidate.spec.ts`, `check-bindings.spec.ts`, `test/composition/*` — single-pass arrays end to end, isolation both ways, `from`/`along`, fail-fast spies, explicit governance, inheritance, plugin `allowDisable`, plugin step-skip evaluation, collect aggregation, hybrid error mapping
      Approach: real `resolveEffectiveBindings` → executor path, no bypass of resolution
      (Req: core:transition-checks; core:check-registry; core:transition-change)

## 31. Verification-attempt-11 follow-up: sovereign schema and verification topology

- [x] 31.1 Return `{ schema, warnings }` from `ResolveChangeSchema`
      `packages/core/src/application/services/resolve-change-schema.ts`: `execute` — return `ResolvedChangeSchema` with `ChangeSchemaVersionAdvisory` (`code: 'SCHEMA_VERSION_DRIFT'`); remove `Logger.warn`
      Approach: export new types from `application/index.ts` and `public.ts`
      (Req: core:resolve-change-schema — Input and result contract, Same-name version advisory)
- [x] 31.2 Update every resolver consumer to destructure `.schema`
      All 35 `packages/core/src` files referencing `ResolveChangeSchema`
      Approach: mechanical; typecheck is the gate
      (Req: core:resolve-change-schema — Shared change-operation boundary)
- [x] 31.3 Add resolver factories and mount `kernel.changes.resolveSchema`
      `packages/core/src/composition/use-cases/resolve-change-schema.ts`, `composition/kernel.ts` — `createResolveChangeSchema(deps|config)`; kernel entry uses the shared instance
      Approach: update kernel types and barrel coverage
      (Req: core:resolve-change-schema — Composition)
- [x] 31.4 Route the validity reconciler through the resolver
      `packages/core/src/application/use-cases/reconcile-change-validity.ts` (~line 203) — replace `schemaProvider.get` with `resolveChangeSchema.execute(...)`; add the dep and wire it
      Approach: identity mismatch now fails before persistence
      (Req: core:change — Verification requirement follows workflow topology)
- [x] 31.5 Make `verificationRequired` consult the change schema
      `reconcile-change-validity.ts`: `verificationRequired(change, schema)` (~line 277) — `isWorkflowStepEnabled('verifying', schema) && VERIFICATION_STATES.has(change.state)`
      Approach: feed both `facts.verificationRequired` and `applyIntent`
      (Req: core:change — Verification requirement follows workflow topology; core:workflow-topology — Step enablement and verification boundary)
- [x] 31.6 Apply the topology boundary in `InvalidateVerification`
      `packages/core/src/application/use-cases/invalidate-verification.ts`: `nextFrom` (~line 124) — require verifying enabled; resolve schema via resolver
      Approach: same `VERIFICATION_STATES` set
      (Req: core:change — Verification requirement follows workflow topology)
- [x] 31.7 Skip verification eligibility in `ApproveSignoff` when verifying is disabled
      `packages/core/src/application/use-cases/approve-signoff.ts` (~lines 113-121)
      Approach: guard with `isWorkflowStepEnabled('verifying', schema)`
      (Req: core:approve-signoff — Signoff recording and state transition; core:change — Signoff gate)
- [x] 31.8 Replace the hardcoded delivery axis in lifecycle verdict
      `packages/core/src/domain/services/lifecycle-verdict.ts`: `DELIVERY_AXIS` (~line 872) — derive positions from `resolveWorkflowPipeline`, mapping drain states to their anchor for comparison only
      Approach: no hardcoded state lists
      (Req: core:lifecycle-engine — Available steps and domain next hop)
- [x] 31.9 Order `availableSteps` canonically
      `lifecycle-verdict.ts`: `availableSteps` projection — sort by pipeline order, not declaration order
      Approach: use the pipeline index map from 31.8
      (Req: core:lifecycle-engine — Available steps and domain next hop)
- [x] 31.10 Route blocked `done` by its real blocker when verifying is disabled
      `packages/core/src/application/services/lifecycle-guidance.ts` (~lines 47, 143) — add `verifyingEnabled` to the guidance context; never return `/specd-verify` or verification start when disabled
      Approach: return sign-off command, `/specd-design`, or `/specd-archive` by blocker/target
      (Req: core:lifecycle-engine — Application lifecycle guidance)
- [x] 31.11 Sync change artifacts against the change schema
      `packages/core/src/infrastructure/fs/change-repository.ts`: `resolveArtifactTypes` signature `(ref) => Promise<readonly ArtifactType[] | null>`; `_artifactTypesFor(ref)` cached per `schemaName`; call sites (~lines 665, 874, 1337)
      Approach: `null` skips sync and leaves the artifact map unchanged
      (Req: core:fs-change-repository — Artifact types come from the change's own schema; core:change — Artifact sync)
- [x] 31.12 Remove the workspace-default version warning from the repository
      `change-repository.ts` (~lines 1343-1352) — delete the comparison block; drop `activeSchema` if unused
      Approach: version advisory belongs only to the resolver
      (Req: core:change-manifest — Schema version; core:change — Schema version)
- [x] 31.13 Wire the repository callback through the resolver
      `packages/core/src/composition/composition-resolver.ts` (~line 439) — call `getResolveChangeSchema().execute(ref)`, return `.schema.artifacts()`, map resolution/identity errors to `null`
      Approach: never resolve `config.schemaRef` for an existing change
      (Req: core:fs-change-repository — Artifact types come from the change's own schema)
- [x] 31.14 Degrade drafted status for every resolution error and add structured identity details
      `packages/core/src/application/use-cases/get-status.ts` (~lines 805-810) — catch all resolution errors; `SCHEMA_IDENTITY_MISMATCH` details `{ requestedName, returnedName }` for active and drafted
      Approach: `schemaInfo: null` on failure
      (Req: core:get-status — Graceful degradation when schema resolution fails)
- [x] 31.15 Expose resolver advisories on status
      `get-status.ts`: result — add `schemaWarnings: readonly ChangeSchemaAdvisory[]`
      Approach: empty array when none
      (Req: core:get-status — Graceful degradation; core:resolve-change-schema — Shared change-operation boundary)
- [x] 31.16 Return no hooks for disabled steps
      `packages/core/src/application/use-cases/get-hook-instructions.ts` — return `[]` when the change schema marks the step `disabled: true`
      Approach: check via `isWorkflowStepEnabled`
      (Req: core:get-hook-instructions — Sovereign schema resolution)
- [x] 31.17 Let `PreviewSpec` propagate schema errors
      `packages/core/src/application/use-cases/preview-spec.ts` — do not convert resolution or identity errors into warnings
      Approach: content/merge failures keep the warning path
      (Req: core:preview-spec — Error handling)
- [x] 31.18 Confirm `EditChange` never consults the global schema for uninitialized specs
      `packages/core/src/application/use-cases/edit-change.ts` — uninitialized added specs are compatible; no `GetActiveSchema`
      Approach: adjust only if the code still consults it
      (Req: core:edit-change — Schema compatibility guardrail)
- [x] 31.19 Add a real-reconciler test helper
      `packages/core/test/application/use-cases/helpers.ts` — add `makeRealReconcile(changes, schemaProvider)`; stop defaulting missing verification to `'not-required'` in verification states with verifying enabled
      Approach: new disabled-verifying tests use the real reconciler
      (Req: default:\_global/testing; core:change — Verification requirement follows workflow topology)
- [x] 31.20 Add sovereign/topology tests
      `reconcile-change-validity.spec.ts`, `get-status.spec.ts`, `approve-signoff.spec.ts`, `archive-change.spec.ts`, lifecycle guidance/engine tests, `change-repository.spec.ts` (replace the ~line 2687 version-warning assertion), `resolve-change-schema.spec.ts`, `preview-spec.spec.ts`, `get-hook-instructions.spec.ts`
      Approach: disabled verifying end to end; wrong-name provider instead of a throwing provider; drafted degradation; `schemaWarnings`; per-schema sync; no logger call
      (Req: core:change; core:get-status; core:archive-change; core:approve-signoff; core:fs-change-repository; core:resolve-change-schema; core:preview-spec; core:get-hook-instructions; core:change-manifest)

## 32. Verification-attempt-11 follow-up: CLI

- [x] 32.1 Add the CLI change-schema helper
      `packages/cli/src/helpers/change-schema.ts`: `resolveChangeSchemaForCli(kernel, changeName)`
      Approach: read the change (active or draft) via `kernel.changes.repo`, then `kernel.changes.resolveSchema.execute({ changeName, schemaName, schemaVersion })`
      (Req: cli:change-validate; cli:change-spec-preview; cli:change-artifacts)
- [x] 32.2 Render the status DAG from the change schema
      `packages/cli/src/commands/change/status.ts` (~lines 237, 401) — drop `getActiveSchema`; `resolveStatusSchemaDag(schema, schemaInfo)`; skip DAG when `schemaInfo` is `null`; print `schemaWarnings`; document `optional` in `--help`
      Approach: DAG from the change schema only
      (Req: cli:change-status — Lifecycle projections come from GetStatus checks)
- [x] 32.3 Use the change schema in `changes validate`
      `packages/cli/src/commands/change/validate.ts` (~lines 221, 308, 489) — helper from 32.1; exit 3 on resolution failure
      (Req: cli:change-validate — Artifact model from the change's schema)
- [x] 32.4 Use the change schema in `changes spec-preview`
      `packages/cli/src/commands/change/spec-preview.ts` (~line 74) — helper from 32.1; exit 1 with `error:` on failure
      (Req: cli:change-spec-preview — Artifact names from the change's schema)
- [x] 32.5 Use the change schema in `changes artifacts`
      `packages/cli/src/commands/change/artifacts.ts` (~line 56) — helper from 32.1
      (Req: cli:change-artifacts — Artifact listing from the change's schema)
- [x] 32.6 Render skipped checks and hooks as skipped
      `packages/cli/src/commands/change/transition.ts` + check-progress presenter — `⊘ <label> (skipped: <reason>)` for `outcome: 'skip'`
      Approach: reason `--skip-hooks`, `--skip-checks`, check message, or `not applicable`
      (Req: cli:change-transition — Check progress rendering)
- [x] 32.7 Suppress or label the post-hook re-check
      Check-progress presenter — track whether a hook effect passed/failed; repeated check ids are hidden when no hook ran, otherwise preceded once by `Re-checking after hooks`
      Approach: JSON stream unchanged
      (Req: cli:change-transition — Check progress rendering)
- [x] 32.8 Keep the transition command signature contract covered
      `packages/cli/test/commands/change/transition.spec.ts` — missing step+`--next`, both together, missing name
      Approach: assert messages and that `TransitionChange.execute` is not called
      (Req: cli:change-transition — Command signature)
- [x] 32.9 Add CLI tests
      `status.spec.ts`, `transition.spec.ts`, `validate.spec.ts`, `spec-preview.spec.ts`, `artifacts.spec.ts`
      Approach: canonical order with disabled step absent, change-schema DAG, `schemaWarnings`, skipped rendering, re-check suppression/label, exit codes
      (Req: cli:change-status; cli:change-transition; cli:change-validate; cli:change-spec-preview; cli:change-artifacts)

## 33. Verification-attempt-11 follow-up: skills

- [x] 33.1 Make `specd-verify` fully status-routed
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` — enter `verifying` and run its hooks only when advertised; disabled verifying produces evidence only if required, then routes forward; completion uses `nextAction.command`; approvals from TOON `lifecycle.approvals`
      Approach: wrap transition/hook instructions in `<!-- route: target -->` … `<!-- /route -->` blocks using `<target>` placeholders
      (Req: skills:workflow-automation — Cross-skill artifact review and recovery)
- [x] 33.2 Make `specd-design` status-routed
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl` — routed blocks for designing/ready hops and completion suggestion from `nextAction.command`
      (Req: skills:workflow-automation — Cross-skill artifact review and recovery)
- [x] 33.3 Make `specd-implement` status-routed
      `packages/skills/templates/skills/specd-implement/SKILL.md.tpl` — routed blocks; no fixed `/specd-verify` suggestion
      (Req: skills:workflow-automation — Cross-skill artifact review and recovery)
- [x] 33.4 Make `specd-archive` and shared notes status-routed
      `specd-archive/SKILL.md.tpl`, `packages/skills/templates/shared/shared.md.tpl` — routed hook pattern; no fixed delivery-state list
      (Req: skills:workflow-automation — Cross-skill artifact review and recovery)
- [x] 33.5 Add the real-template protocol validator test
      `packages/skills/test/template-protocol.spec.ts` — fail on literal-state transitions, literal-state hooks, or fixed next-skill completion text outside routed blocks, for templates and installed copies
      (Req: skills:workflow-automation — Lifecycle template protocol validation)
- [x] 33.6 Remove tautological simulation tests
      `packages/skills/test/generated-skill-protocol.spec.ts` — delete the seven "simulates …" tests and `evaluateSkillProtocol`
      (Req: skills:workflow-automation — Lifecycle template protocol validation)
- [x] 33.7 Regenerate installed skill copies
      `.claude/skills/*`, `.specd/config/skills/*`, `.agents/skills/*`, `.codex/skills/*` — run `pnpm ai-agents:sync` and the plugin install/update path; no hand edits
      (Req: skills:workflow-automation — Lifecycle template protocol validation)

## 34. Verification-attempt-11 validation gates

- [x] 34.1 Run focused suites for groups 28–33
      Topology, build-schema, check pipeline, resolver, reconciler, status, signoff, archive, repository, CLI, skills test files
      Approach: zero failures before broad gates
      (Req: all verification-attempt-11 scenarios)
- [x] 34.2 Run full repository quality gates
      `pnpm typecheck`, `pnpm lint`, `pnpm test`
      Approach: zero failures; no new `any`, unsafe assertion, suppression, or default export
      (Req: default:\_global/architecture, conventions, testing)
- [x] 34.3 Perform the disabled-verifying manual E2E
      Fixture project: change schema disables `verifying`, makes `implementing` optional, workspace default `@specd/schema-std`
      Approach: `changes status`, `transition --next` to `done`, `transition archivable --skip-hooks all` (expect `⊘`), archive — no verification blocker anywhere
      (Req: core:workflow-topology — Step enablement and verification boundary)

## 35. Verification-attempt-12 follow-up: governance split

- [x] 35.1 Add `allowSchemaEmbedding` to check governance types
      `packages/core/src/domain/services/check-registry.ts`: `CheckGovernance`, `PluginCheckRegistrationOptions` — add the field
      Approach: required on `CheckGovernance`, optional on options (design S1)
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.2 Initialize built-in embedding governance
      `check-registry.ts`: constructor — Category A/B `allowSchemaEmbedding: false`, Category C `true`
      Approach: reuse `nonEmbeddableBuiltins` set
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.3 Default plugin `allowSchemaEmbedding` from default bindings
      `check-registry.ts`: `register()` — `options?.allowSchemaEmbedding ?? (defaultBindings?.length ? false : true)`
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.4 Forward `allowSchemaEmbedding` through composition
      `packages/core/src/composition/composition-registries.ts`: `createCompositionRegistryView` and the plugin registration type
      Approach: mirror `allowDisable` forwarding; re-export type through SDK if exported
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.5 Inherit `allowConfigOverride` in `applyBindingSpecs`
      `packages/core/src/domain/services/transition-checks.ts`: `applyBindingSpecs` — `spec.allowConfigOverride ?? governanceOf?.(spec.id)?.allowConfigOverride ?? false`
      Approach: declare `allowConfigOverride: true` explicitly on Category C rows of `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts`
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.6 Apply placement lock in `buildSchema` checks loop
      `packages/core/src/domain/services/build-schema.ts`: transition `checks` loop — `isOwnCoordinate` match with `to`/`along`/`from`; throw `CheckEmbeddingForbiddenError` only when not own coordinate and `allowSchemaEmbedding === false`; drop `isPluginCheck`
      (Req: core:workflow-model — Workflow step checks and skip-checks declarations)
- [x] 35.7 Apply placement lock in `buildSchema` skipChecks loop
      `build-schema.ts`: `skipChecks` loop — same rule with `step` coordinate
      (Req: core:workflow-model — Workflow step checks and skip-checks declarations)
- [x] 35.8 Restrict binding-level locks to own coordinates
      `build-schema.ts`: both loops — `matchingBinding` policy/config/disable locks apply only when `isOwnCoordinate`; schema-owned declarations check only check-level `allowConfigOverride` / `allowDisable`
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.9 Update governance fixtures
      Test helpers constructing `CheckGovernance` / registries — add `allowSchemaEmbedding`
      (Req: core:check-registry — Two-tier governance and confinement locks)
- [x] 35.10 Add governance tests
      `packages/core/test/domain/services/build-schema.spec.ts`, `check-registry.spec.ts`, `check-bindings.spec.ts` — placement lock; built-in at own coordinate with config; schema-owned layer override; check-level config lock on schema-owned; `allowConfigOverride` inheritance; embedding defaults; Category A/B/C values; `list()` length 18 and `has()`
      (Req: core:check-registry — all governance scenarios)

## 36. Verification-attempt-12 follow-up: executable check instances

- [x] 36.1 Expose built-in instances from the workflow check registry
      `packages/core/src/application/checks/workflow-check-registry.ts`: `WorkflowCheckRegistry.checks` — return the `create*` record
      (Req: core:check-registry — Two-tier governance and confinement locks, item 8)
- [x] 36.2 Add `CheckRegistry.withExecutableBuiltins`
      `check-registry.ts`: copy catalog/bindings/governance/coordinates, replace built-in catalog entries; reject non-built-in ids or kind mismatch with `InvalidInputError`
      (Req: core:check-registry — Two-tier governance and confinement locks, item 8)
- [x] 36.3 Return the executable registry from composition
      `packages/core/src/composition/use-cases/workflow-check-registry.ts`: `resolveWorkflowCheckRegistry` — `checkRegistry: resolver.registry?.checks?.withExecutableBuiltins(builtins.checks)`
      (Req: core:transition-checks — Dynamic runtime binding composition, item 8)
- [x] 36.4 Wire the executable registry into use cases
      `packages/core/src/composition/use-cases/transition-change.ts`, `get-status.ts`, archive composition — pass it instead of `resolver.registry?.checks`
      (Req: core:transition-checks — Dynamic runtime binding composition, item 8)
- [x] 36.5 Add executable-instance tests
      `packages/core/test/domain/services/check-registry.spec.ts`, `test/composition/use-cases/workflow-check-registry.spec.ts`, `transition-change.spec.ts` — replacement and rejection; composed `impl.linksInScope` fails on out-of-scope links; embedded `impl.linksInScope` on `done` fails `verifying → done`
      (Req: core:check-registry — Composition registry exposes executable instances; Schema-embedded Category C check surfaces its real result)

## 37. Verification-attempt-12 follow-up: single cascade

- [x] 37.1 Add `from` to `ResolveEffectiveBindingsInput`
      `transition-checks.ts`: input type; callers `evaluate-transition-candidate.ts`, `transition-change.ts` L272, any `get-status.ts` call pass `from`
      (Req: core:transition-checks — Dynamic runtime binding composition, item 5)
- [x] 37.2 Rewrite the transition overlay per attempt
      `transition-checks.ts`: `resolveEffectiveBindings` — `declMatchesAttempt` via `checkMatches`; unmatched declarations leave base bindings unchanged; disabled removes overlaid rows; enabled replaces them with one concrete clone; remainder rows keep original config; synthesize only when no base row matches
      Approach: design S3 steps 1–7; remove the permissive `along === undefined` claim
      (Req: core:transition-checks — Dynamic runtime binding composition, items 4–5)
- [x] 37.3 Narrow step-skip clones to the concrete step
      `transition-checks.ts`: step-skip overlay — clone applicability `[{ scope: 'step-skip', step: bypassedStep }]`; one clone per declared bypassed step
      (Req: core:transition-checks — Dynamic runtime binding composition, item 6)
- [x] 37.4 Remove step-declaration handling from the predicate runner
      `packages/core/src/application/services/execute-matching-predicates.ts` — delete `stepCheckDecls`, the `stepDecl.disabled` skip, and the fallback loop
      (Req: core:transition-checks — Dynamic runtime binding composition, item 7)
- [x] 37.5 Emit `check-done` on user bypass
      `execute-matching-predicates.ts`: bypass branch keeps progress event parity
      (Req: core:transition-checks — Generic check progress bus)
- [x] 37.6 Add cascade tests
      `packages/core/test/domain/services/transition-checks.spec.ts`, `test/application/services/execute-matching-predicates.spec.ts` — from/along matrix with default-bound check; wildcard narrowing across two bypassed steps; runner without fallback; bypass progress event; config arrays not duplicated end to end
      (Req: core:transition-checks — Dynamic runtime binding composition scenarios; core:check-registry — Cascading configuration hierarchy)

## 38. Verification-attempt-12 follow-up: policy from resolved bindings

- [x] 38.1 Return resolved bindings from the candidate evaluator
      `packages/core/src/application/services/evaluate-transition-candidate.ts`: `TransitionCandidateEvaluation.bindings`
      (Req: core:transition-checks — Dynamic runtime binding composition, item 9)
- [x] 38.2 Validate `skipChecks` against resolved bindings
      `transition-change.ts`: skip validation loop — use `effectiveBindings`; drop `this._checkRegistry.bindings()`
      (Req: core:transition-change — Canonical pre-transition validity reconciliation)
- [x] 38.3 Map failure `skippable` from resolved bindings
      `transition-change.ts`: `_throwPredicateFailures` default branch — `candidate.bindings`
      (Req: core:transition-change — Canonical pre-transition validity reconciliation)
- [x] 38.4 Derive status blocker bypass from resolved bindings
      `packages/core/src/application/use-cases/get-status.ts`: `_mergeBlockers` — `bindingsByTarget` from candidates plus archive bindings
      (Req: core:get-status — Identifies blockers)
- [x] 38.5 Add policy tests
      `transition-change.spec.ts`, `get-status.spec.ts` — schema-declared `skippable` honored in error, skip validation, and `bypassFlag`; collected failures abort before effects
      (Req: core:transition-checks — Derived policy is read from resolved bindings; core:get-status — Schema-declared skippability drives the bypass flag)

## 39. Verification-attempt-12 follow-up: transition refresh and recovery

- [x] 39.1 Document refresh-flag semantics
      `transition-change.ts`: JSDoc for `refreshImplementationTrackingBefore` (L83, L186) — skips only the pre-evaluation refresh; post-hook reconcile always refreshes
      (Req: core:transition-change — Optional pre-transition implementation tracking refresh)
- [x] 39.2 Route committed recovery through lifecycle guidance
      `transition-change.ts`: `committedRecoveryError` — build `nextAction` from `evaluateLifecycle`; call site passes change, schema, approvals
      (Req: core:transition-change — Canonical pre-transition validity reconciliation, item 5)
- [x] 39.3 Add refresh and recovery tests
      `transition-change.spec.ts` — opt-out still refreshes after hooks (fix the test at L359 to assert the pre-refresh skip only); hook-created file blocks `verifying`; committed recovery with verifying disabled never recommends `/specd-verify`
      (Req: core:transition-change — Explicit opt-out skips only the pre-evaluation refresh; Post-hook refresh catches files changed by hooks; Committed recovery with verifying disabled)

## 40. Verification-attempt-12 follow-up: topology-driven guidance

- [x] 40.1 Replace `verificationBoundary` with a pipeline-based helper
      `packages/core/src/domain/services/lifecycle-verdict.ts`: export `isAtOrAfterVerificationBoundary(state, schema, approvals)` using `pipelineIndex` and `resolveWorkflowPipeline`; update call sites
      (Req: core:lifecycle-engine — Available steps and domain next hop)
- [x] 40.2 Use the helper in guidance
      `packages/core/src/application/services/lifecycle-guidance.ts`: `resolveLifecycleCommand` — replace the inline state list; pass `schema` through the guidance context from `evaluateLifecycle`
      (Req: core:lifecycle-engine — Application lifecycle guidance)
- [x] 40.3 Route blocked `done` with verifying disabled to the real blocker
      `lifecycle-guidance.ts`: `done`/`signed-off` branch — archivable → archive; designing/review → design; signoff gate not valid → `specd changes approve signoff`; else archive
      (Req: core:lifecycle-engine — Application lifecycle guidance)
- [x] 40.4 Add guidance tests
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`, `lifecycle-verdict.spec.ts` — noncanonical rows with disabled verifying; blocked `done` with the real reconciler and signoff gate on; second optional step skip failing; canonical `availableSteps` order
      (Req: core:lifecycle-engine — Guidance verification boundary follows topology; Blocked done with verifying disabled routes to the real blocker)

## 41. Verification-attempt-12 follow-up: topology and hooks

- [x] 41.1 Make `nextWorkflowStep` drain-safe
      `packages/core/src/domain/services/workflow-topology.ts`: `nextWorkflowStep` — `pending-*` → null; `spec-approved`/`signed-off` → first non-designing legal exit or null
      (Req: core:workflow-topology — Topological forward progression)
- [x] 41.2 Add topology tests
      `packages/core/test/domain/services/workflow-topology.spec.ts` — drain cases; non-null result always legal; `designing → designing`; `ready → done` with implementing and verifying disabled; verifying backward edges; export surface has only the six functions; approval snapshot through bypass/next with the `ready` anchor
      (Req: core:workflow-topology — Drain states only return legal next steps; Next step is always a legal transition; Redesign re-entry is legal from designing)
- [x] 41.3 Return no hooks for disabled steps in `RunStepHooks`
      `packages/core/src/application/use-cases/run-step-hooks.ts`: both resolution paths — `!isWorkflowStepEnabled(step, schema)` returns the empty result before `--only` filtering
      (Req: core:run-step-hooks — Step resolution)
- [x] 41.4 Add hook tests
      `run-step-hooks.spec.ts`, `get-hook-instructions.spec.ts` — disabled step pre/post and `--only`; get-hook-instructions post phase and identity mismatch
      (Req: core:run-step-hooks — Disabled step returns no hooks in either phase; core:get-hook-instructions — Disabled step returns no hook instructions)

## 42. Verification-attempt-12 follow-up: schema resolution

- [x] 42.1 Resolve named schemas without the default
      `packages/core/src/composition/lazy-schema-provider.ts`: `get(ref?)` — named lookups never resolve the default first
      (Req: core:resolve-change-schema — Sovereign named lookup)
- [x] 42.2 Add schema-resolution tests
      `lazy-schema-provider.spec.ts`, `reconcile-change-validity.spec.ts`, `change-repository.spec.ts`, `resolve-change-schema.spec.ts` — named lookup with broken default; reconciler identity mismatch; repository sync with differing default and a real version difference; enabled-verifying asserts `VERIFICATION_REQUIRED`
      (Req: core:resolve-change-schema — Broken workspace default does not block a named lookup; core:change scenarios)

## 43. Verification-attempt-12 follow-up: metadata schema precedence

- [x] 43.1 Add `schemaName` input and precedence to `GenerateSpecMetadata`
      `packages/core/src/application/use-cases/generate-spec-metadata.ts`: input type, read lock first, select schema (explicit → lock → default), identity check, provenance from the used schema
      (Req: core:generate-metadata — Schema resolution; Assembled result)
- [x] 43.2 Forward `schemaName` in `MaterializeSpecMetadata`
      `packages/core/src/application/use-cases/materialize-spec-metadata.ts`: input type and every generation / freshness path
      (Req: core:materialize-spec-metadata — Input and result contract)
- [x] 43.3 Pass the change schema from archive
      `packages/core/src/application/use-cases/archive-change.ts` ~L605 — `schemaName: schema.name()`; remove the orphan JSDoc block ~L1403
      (Req: core:archive-change — Spec metadata generation)
- [x] 43.4 Pass the change schema from other change-bound metadata callers
      `CompileContext` (and any change-scoped `materializeMetadata` caller found via `graph impact --symbol MaterializeSpecMetadata`) — pass the change schema name when known
      (Req: core:resolve-change-schema — Shared change-operation boundary)
- [x] 43.5 Add metadata tests
      `generate-spec-metadata.spec.ts`, `materialize-spec-metadata.spec.ts`, `archive-change.spec.ts` — precedence, no fallback, identity mismatch, provenance; forwarding and if-needed reuse; archive passes change schema; archive with verifying disabled and with stale verification using the real reconciler
      (Req: core:generate-metadata, core:materialize-spec-metadata, core:archive-change scenarios; core:workflow-topology — Disabled verifying never requires verification evidence end to end)

## 44. Verification-attempt-12 follow-up: CLI

- [x] 44.1 Map identity mismatch to exit 3
      `packages/cli/src/handle-error.ts` — `SchemaProviderIdentityMismatchError` / `SCHEMA_PROVIDER_IDENTITY_MISMATCH` → `cliError(…, 3, code)`
      (Req: cli:change-validate — Artifact model from the change's schema)
- [x] 44.2 Keep the identity code in validate
      `packages/cli/src/commands/change/validate.ts`: `resolveValidateSchema` — mismatch code preserved
      (Req: cli:change-validate — Artifact model from the change's schema)
- [x] 44.3 Render resolver advisories in validate, spec-preview, artifacts
      `validate.ts`, `spec-preview.ts`, `artifacts.ts` — text `warnings:` block, structured `schemaWarnings`; spec-preview `--artifact` schema failure exits 3
      (Req: core:resolve-change-schema — Shared change-operation boundary)
- [x] 44.4 Add CLI tests and fixtures
      `packages/cli/test/commands/helpers.ts`, `change-validate.spec.ts`, `change/spec-preview.spec.ts`, `change-artifacts.spec.ts`, `change/status.spec.ts` — `resolveSchema` mock with a custom schema differing from `getActiveSchema`; disabled-step fixture; single-spec exit 3 `fatal:`; identity code; advisories rendered; status unresolvable-schema blocker
      (Req: cli:change-validate scenarios; cli:change-status — Schema mismatch; Different workspace default is not drift)

## 45. Verification-attempt-12 follow-up: skills and remaining tests

- [x] 45.1 Stop reading approvals from text status
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl` L446, `specd-implement/SKILL.md.tpl` ~L85 — approvals only from toon `lifecycle.approvals`
      (Req: skills:workflow-automation — Approval gating comes from structured status)
- [x] 45.2 Remove the fixed advancement sequence from verify
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` — replace the `implementing → verifying → done → archivable` sentence
      (Req: skills:workflow-automation — Fixed canonical recipes cannot override structured routing)
- [x] 45.3 Strengthen the protocol validator
      `packages/skills/test/template-protocol.spec.ts` — literal targets inside routed blocks; broader fixed-completion regex; missing installed copy fails; no text-approvals reads
      (Req: skills:workflow-automation — Lifecycle template protocol validation)
- [x] 45.4 Regenerate installed skill copies
      Run `pnpm ai-agents:sync` and the plugin install/update path; no hand edits
      (Req: skills:workflow-automation — Current templates and installed copies pass)
- [x] 45.5 Add identity-mismatch and keyed-mock tests across use cases
      `preview-spec.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, `compile-context.spec.ts`, `get-artifact-instruction.spec.ts`, `validate-artifacts.spec.ts`, `run-step-hooks.spec.ts` — identity mismatch propagates; "default differs" tests use name-keyed `mockImplementation`
      (Req: core:resolve-change-schema — Change-bound consumers use the shared resolver)
- [x] 45.6 Fix weak or stale tests
      `invalidate-change.spec.ts` (non-default schema), `edit-change.spec.ts` L541 (rename/replace), `transition-checks.spec.ts` L68-76 (use a schema that omits `implementing`), `workflow-topology.spec.ts` L327 (anchor test must not rely on disabling `done`); remove unused `SchemaMismatchError` imports
      (Req: default:\_global/testing)
- [x] 45.7 Add a real `schema-std` load test
      `packages/schema-std/test` (or core) — load `packages/schema-std/schema.yaml` through `buildSchema` and assert lifecycle rows and flags
      (Req: schema-std:standard-schema — Standard lifecycle steps and transitions are defined)

## 46. Verification-attempt-12 validation gates

- [x] 46.1 Run focused suites for groups 35–45
      Approach: zero failures before broad gates
      (Req: all verification-attempt-12 scenarios)
- [x] 46.2 Run full repository quality gates
      `pnpm typecheck`, `pnpm lint`, `pnpm test`
      Approach: zero failures; no new `any`, unsafe assertion, suppression, or default export
      (Req: default:\_global/architecture, conventions, testing)

## 47. Verification-attempt-14 compliance follow-up

- [x] 47.1 Derive `InvalidateChange` next action from lifecycle guidance
      `packages/core/src/application/use-cases/invalidate-change.ts` `invalidationNextAction` — use `evaluateLifecycle`; keep recovery reason; update composition/deps for approvals if needed
      (Req: core:invalidate-change — Next action follows lifecycle guidance)
- [x] 47.2 Test recovery guidance with verifying disabled and enabled
      `packages/core/test/application/use-cases/invalidate-change.spec.ts` — fix the assertion at ~L435 to apply only to verifying enabled; add disabled case
      (Req: core:invalidate-change — Recovery with verifying disabled never recommends verification)
- [x] 47.3 Pass the resolved actor into `EditChange` reconciliation
      `packages/core/src/application/use-cases/edit-change.ts` `_executeScopeEdit` — `reconcile.mutate({ name, actor })`; add a test asserting a single `identity()` call
      (Req: core:edit-change — same decorated identity for edit and reconciliation events)
- [x] 47.4 Reword the fixed advancement chain in the verify template
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` ~L82-84, ~L361-363; run `pnpm ai-agents:sync`; no hand edits to installed copies
      (Req: skills:workflow-automation — Fixed canonical recipes cannot override structured routing)
- [x] 47.5 Add the missing check/governance tests
      `build-schema.spec.ts` (merge-then-build layered override via `mergeSchemaLayers` then `buildSchema`), `composition-registries.spec.ts` (`allowSchemaEmbedding` forwarding), `workflow-check-registry.spec.ts` or `kernel.spec.ts` (plugin `step-skip` default binding failing a shortcut end to end), `check-registry.spec.ts` (`list()` length 18 with 2 plugins)
      (Req: core:check-registry — Schema-owned binding may be changed by a later schema layer; Composition forwards plugin governance; Plugin step-skip default bindings are evaluated)
- [x] 47.6 Add the missing topology/model/lifecycle tests
      `workflow-topology.spec.ts` (shortcut stops at first non-optional step; `next === null` for spec-approved with implementing disabled; backward edges from verifying; drain states never in pipeline), `approval-signoff.spec.ts` (`not-required` predicate cases), an end-to-end disabled-verifying flow (implementing → done → archivable → archive with the real reconciler), `lifecycle-engine.spec.ts` (blocked `done` through `evaluateLifecycle` with the real reconciler; noncanonical `workflow[]` row order)
      (Req: core:workflow-topology — Topological forward progression, Disabled verifying never requires verification evidence end to end; core:lifecycle-engine — Blocked done with verifying disabled routes to the real blocker, Guidance verification boundary follows topology)
- [x] 47.7 Add the missing schema-resolution and use-case tests
      `get-hook-instructions.spec.ts` (identity mismatch; `--only` on disabled step), `materialize-spec-metadata.spec.ts` (if-needed reuse path with a persisted snapshot), `get-spec-metadata.spec.ts` (schemaName forwarding), `compile-context.spec.ts` (`getMetadata` input for in-change vs out-of-change spec), `archive-change.spec.ts` (keyed `custom-workflow` provider asserts materialize receives `schemaName: 'custom-workflow'`)
      (Req: core:get-hook-instructions, core:materialize-spec-metadata, core:compile-context — Change schema applies to change specs only, core:archive-change — Post-archive metadata is materialized with the change schema)
- [x] 47.8 Add the missing CLI status tests
      `packages/cli/test/commands/change/status.spec.ts` — pipeline in canonical order omitting disabled steps; optional steps annotated while disabled steps are omitted
      (Req: cli:change-status — Pipeline follows canonical order and omits disabled steps)
- [x] 47.9 Run focused suites and full repository gates
      `pnpm typecheck`, `pnpm lint`, `pnpm test`; zero failures
      (Req: default:\_global/architecture, conventions, testing)

## 48. Verification-attempt-15 compliance follow-up

- [x] 48.1 Stop swallowing schema resolution failures in `change artifacts`
      `packages/cli/src/commands/change/artifacts.ts` ~L58-71 — rethrow every error except `ChangeNotFoundError`; `handle-error.ts` already maps `SchemaProviderIdentityMismatchError` to exit 3
      (Req: cli:change-artifacts — schema resolution failures are reported as errors with a non-zero exit code)
- [x] 48.2 Test resolution failure and identity mismatch for `change artifacts`
      `packages/cli/test/commands/change-artifacts.spec.ts` — resolution failure exits non-zero with no rows; identity mismatch exits 3; success path unchanged
      (Req: cli:change-artifacts — same)
- [x] 48.3 Run focused suites and full repository gates
      `pnpm typecheck`, `pnpm lint`, `pnpm test`; zero failures
      (Req: default:\_global/architecture, conventions, testing)

## 49. Lite compliance follow-up (report 20261020-104306)

- [x] 49.1 Test that `PreviewSpec` propagates a schema resolution failure
      `packages/core/test/application/use-cases/preview-spec.spec.ts` — provider rejects for the change schema; `execute` rejects with that error and never reads specs
      (Req: core:preview-spec — Error handling: Schema resolution failure propagates)
- [x] 49.2 Test that the kernel exposes the shared resolver
      `packages/core/test/composition/` — `kernel.changes.resolveSchema` is the memoized `ResolveChangeSchema` instance the change-bound use cases receive; `createResolveChangeSchema` works with both config and deps overloads
      (Req: core:resolve-change-schema — Kernel exposes the shared resolver)
- [x] 49.3 Assert `workflow.tasksEmpty` embedding governance
      `packages/core/test/domain/services/check-registry.spec.ts` — Category B `workflow.tasksEmpty` has `allowSchemaEmbedding`, `allowBindingOverride`, `allowDisable` all false
      (Req: core:check-registry — Category B built-in checks include workflow.tasksEmpty with native attribute governance)
- [x] 49.4 Run focused suites and full repository gates
      `pnpm typecheck`, `pnpm lint`, `pnpm test`; zero failures
      (Req: default:\_global/architecture, conventions, testing)

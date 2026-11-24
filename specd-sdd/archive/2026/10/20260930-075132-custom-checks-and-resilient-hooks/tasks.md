# Tasks: custom-checks-and-resilient-hooks

## 1. Domain Services & Check Registry

- [x] 1.1 Create CheckRegistry domain service and interfaces
      `packages/core/src/domain/services/check-registry.ts`: `CheckRegistry` — create class and interface to manage open check catalog and bindings
      Approach: Implement `CheckRegistry` with internal catalog `Map<string, Check>`, constructor-injected built-ins, and query methods (`get`, `has`, `list`, `bindings`).
      (Req: Open check registry)

- [x] 1.2 Implement register method with canonical namespacing and kind validation
      `packages/core/src/domain/services/check-registry.ts`: `register` — validate `pluginName`, namespace check to `@${pluginName}.${check.id}`, and adapt `CustomCheckDefinition`
      Approach: Validate `pluginName` against `^[a-zA-Z0-9_-]+$`; throw `InvalidPluginNameError` on invalid characters; throw `InvalidCheckKindError` if input contains `kind !== 'predicate'`; stamp `kind: 'predicate'` and wrap into `Check`.
      (Req: Canonical namespacing and plugin registration, Adaptation of CustomCheckDefinition to internal Check)

- [x] 1.3 Implement coordinate duplicate prevention and two-tier governance locks
      `packages/core/src/domain/services/check-registry.ts`: `register` — enforce coordinate uniqueness and record check-level and binding-level locks
      Approach: Track bindings by `{ checkId, scope, to, along }`; throw `DuplicateCheckBindingError` on collisions; record `allowBindingOverride`, `allowConfigOverride`, and `defaultConfig`.
      (Req: Binding coordinate identity and duplicate prevention, Two-tier governance and confinement locks)

- [x] 1.4 Define domain error classes for check registry and governance
      `packages/core/src/domain/errors/check-registry-errors.ts`: `CheckRegistryError` — create typed domain error classes
      Approach: Export `InvalidPluginNameError`, `DuplicateCheckError`, `DuplicateCheckBindingError`, `InvalidCheckKindError`, `CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`, `CheckNotSkippableError`, and `UnknownCheckError` extending `SpecdError`.
      (Req: Two-tier governance and confinement locks, Strict predicate enforcement)

- [x] 1.5 Update Check, CheckResult, and CheckExecutionContext contracts
      `packages/core/src/domain/services/transition-checks.ts`: `Check`, `CheckResult`, `CheckExecutionContext` — open `CheckId`, enrich results, and isolate config
      Approach: Change `CheckId` to `string`; add `command?: string` to `CheckResult`; add `config?: Readonly<Record<string, unknown>>` to `CheckExecutionContext`; purge `allowOutOfScope` and `allowOverlap`.
      (Req: Check identity and result, Check ABI create and WorkflowCheck)

- [x] 1.6 Export CustomCheckDefinition public authoring contract
      `packages/core/src/domain/services/transition-checks.ts`: `CustomCheckDefinition` — export public contract for plugin authors
      Approach: Define `CustomCheckDefinition` with `id`, `label`, `command?: string`, and `execute(ctx: CheckExecutionContext): Promise<CheckResult>` without `kind` or `skippable`.
      (Req: Public CustomCheckDefinition contract)

- [x] 1.7 Purge legacy bypass branches from built-in check implementations
      `packages/core/src/domain/services/impl-links-in-scope.ts`, `packages/core/src/domain/services/spec-overlap.ts`: pure check execution — remove legacy bypass booleans
      Approach: In `impl-links-in-scope.ts`, remove `allowOutOfScope` from facts and eliminate bypass branch; in `spec-overlap.ts`, remove `allowOverlap` from facts and eliminate bypass branch; keep checks purely invariant-focused.
      (Req: Registry bindings for this capability)

- [x] 1.8 Update check bindings with explicit skippability permissions
      `packages/core/src/domain/services/check-bindings.ts`: `CheckBindingSpec`, `TRANSITION_BINDING_SPECS`, `ARCHIVE_BINDING_SPECS` — annotate skippable bindings
      Approach: Set `skippable: true` for `impl.linksInScope` and `spec.overlap` in transition and archive binding spec tables; explicitly set `skippable: false` on all other 11 built-in predicate bindings.
      (Req: Registry bindings for this capability)

- [x] 1.9 Extract reusable deepMergeConfig domain helper
      `packages/core/src/domain/services/deep-merge-config.ts`, `packages/core/src/application/ports/config-schema.ts`: `deepMergeConfig` — create reusable deep merge helper and refactor config cascade
      Approach: Implement pure `deepMergeConfig(base, overlay, options?)` in `domain/services/deep-merge-config.ts` supporting recursive object merging, array concatenation, and `ignoredKeys`; refactor `deepMergeRawConfig` in `config-schema.ts` to delegate to it.
      (Req: Public CustomCheckDefinition contract, Check declarations and governance validation)

## 2. Workflow Model & Schema Validation

- [x] 2.1 Extend WorkflowStep with check declarations
      `packages/core/src/domain/value-objects/workflow-step.ts`: `WorkflowStep`, `WorkflowStepCheckDeclaration` — add `checks` array to step value object
      Approach: Define `WorkflowStepCheckDeclaration` (`id`, `from?`, `along?`, `onFailure?`, `skippable?`, `config?`) and add `checks?: readonly WorkflowStepCheckDeclaration[]` to `WorkflowStep`.
      (Req: Step check declarations)

- [x] 2.2 Add onFailure policy to HookEntry value objects
      `packages/core/src/domain/value-objects/workflow-step.ts`: `HookEntry`, `RunHookEntry`, `ExternalHookEntry` — add `onFailure` policy
      Approach: Export `type HookFailurePolicy = 'abort' | 'warn'` and add `onFailure?: HookFailurePolicy` to `RunHookEntry` and `ExternalHookEntry`.
      (Req: Resilient hook failure policy)

- [x] 2.3 Implement schema compilation validation for check declarations and locks
      `packages/core/src/domain/services/build-schema.ts`: `buildSchema` — validate step checks against CheckRegistry
      Approach: In `buildWorkflowStep`, validate check ID syntax and assert existence in `CheckRegistry` (`UnknownCheckError`); reject coordinate duplicates (`DuplicateCheckBindingError`); assert check-level confinement (`CheckEmbeddingForbiddenError`); assert binding policy lock (`CheckBindingOverrideForbiddenError`); assert config lock (`CheckConfigOverrideForbiddenError`).
      (Req: Check declarations and governance validation)

- [x] 2.4 Validate hook onFailure property in buildSchema
      `packages/core/src/domain/services/build-schema.ts`: `buildHookEntry` — validate `onFailure` value
      Approach: Check `onFailure` value on `run` and `external` hooks; throw schema error if value is not `'abort'` or `'warn'`.
      (Req: Check declarations and governance validation)

## 3. Application Use Cases & Orchestration

- [x] 3.1 Create unified CheckPredicateFailedError
      `packages/core/src/domain/errors/check-predicate-failed-error.ts`: `CheckPredicateFailedError` — create unified domain error for failed predicate checks
      Approach: Class extending `SpecdError` encapsulating `checkId`, `label`, `code`, `message`, `command?`, and `details?`.
      (Req: Shared runner errors propagate on transition)

- [x] 3.2 Update TransitionChangeInput and drop legacy bypass flags
      `packages/core/src/application/use-cases/lifecycle/transition-change.ts`: `TransitionChangeInput` — update input interface
      Approach: Remove `allowOutOfScope` and `allowOverlap`; add `skipChecks?: readonly string[]`.
      (Req: Input contract)

- [x] 3.3 Implement dynamic check resolution and skippability enforcement in TransitionChange
      `packages/core/src/application/use-cases/lifecycle/transition-change.ts`: `execute` — resolve active checks and evaluate bypasses
      Approach: Query `CheckRegistry` and step `checks`; for each id in `skipChecks`, throw `UnknownCheckError` if missing, throw `CheckNotSkippableError` if matching binding has `skippable !== true`; record synthetic skip `{ outcome: 'skip', details: { bypassedByUser: true } }` for allowed bypasses without executing check.
      (Req: Canonical pre-transition validity reconciliation)

- [x] 3.4 Implement cascading config resolution and execution in TransitionChange
      `packages/core/src/application/use-cases/lifecycle/transition-change.ts`: `execute` — compute effective config and invoke checks
      Approach: Deep merge `checkDefaultConfig` → `bindingDefaultConfig` → `stepConfig` using `deepMergeConfig` into `ctx.config`; pass into `check.execute(ctx)`; abort on `outcome === 'fail'` and throw `CheckPredicateFailedError`.
      (Req: Canonical pre-transition validity reconciliation, Shared runner errors propagate on transition)

- [x] 3.5 Refactor GetStatus to dynamically project check blockers and remediation
      `packages/core/src/application/use-cases/lifecycle/get-status.ts`: `_mergeBlockers` — remove hardcoded check branching and dynamically project skippable flags
      Approach: Lookup checks in registry bindings; project `bypassFlag: '--skip-checks ' + check.id` for any check whose binding has `skippable: true`; project check remediation `command` into `nextAction`.
      (Req: Actionable fail diagnostics, Projections)

- [x] 3.6 Implement non-blocking hook warnings in RunStepHooks
      `packages/core/src/application/use-cases/lifecycle/run-step-hooks.ts`: `execute` — support `onFailure: 'warn'`
      Approach: When hook process exits non-zero: if `hook.onFailure === 'warn'`, capture exitCode, stdout, stderr into `warnings[]`, emit warning progress, and continue loop; if `abort`, push to `failedHooks` and halt; set `success = failedHooks.length === 0`.
      (Req: Pre-hook failure semantics, Post-hook failure semantics)

- [x] 3.7 Update HookEffectCheck to advance on non-blocking hook warnings
      `packages/core/src/domain/services/transition-checks.ts`: `hookPreCheck`, `hookPostCheck` — evaluate phase success
      Approach: Set check `outcome: 'pass'` when `RunStepHooksResult.success` is true even if `warnings.length > 0`, allowing transition to proceed while preserving warnings.
      (Req: Pre-hook failure semantics)

## 4. Composition & Kernel Layer

- [x] 4.1 Extend CompositionRegistryInput and KernelOptions with checks
      `packages/core/src/composition/composition-registry.ts`: `CompositionRegistryInput`, `KernelOptions` — add `checks` array
      Approach: Define `PluginCheckRegistration` interface (`pluginName`, `check`, `defaultConfig?`, `allowConfigOverride?`, `allowBindingOverride?`, `defaultBindings?`) and add `checks?: readonly PluginCheckRegistration[]` to registry input.
      (Req: KernelOptions supports additive registries)

- [x] 4.2 Wire CheckRegistry in createKernel
      `packages/core/src/composition/create-kernel.ts`: `createKernel` — instantiate and populate CheckRegistry
      Approach: Construct `CheckRegistry` with built-ins; iterate over `options.checks` and call `register()`; inject registry into `TransitionChange`, `GetStatus`, and `buildSchema`.
      (Req: Check Registration and KernelBuilder Extension)

- [x] 4.3 Add registerCheck fluent method to KernelBuilder
      `packages/core/src/composition/kernel-builder.ts`: `KernelBuilder` — expose fluent registration
      Approach: Implement `registerCheck(pluginName, check, defaultBindings?, options?): this` delegating to `CheckRegistry`; expose `kernel.registry.checks` on composition view.
      (Req: Check Registration and KernelBuilder Extension)

## 5. CLI Adapters & Repair Guide

- [x] 5.1 Add --skip-checks option and translate legacy aliases in transition command
      `packages/cli/src/commands/changes/transition.ts`: `command` — parse `--skip-checks` and translate legacy flags
      Approach: Add `--skip-checks <ids>` option; parse comma-separated list into array; map `--allow-out-of-scope` to `'impl.linksInScope'` and `--allow-overlap` to `'spec.overlap'`; forward to `TransitionChangeInput.skipChecks`.
      (Req: Command signature)

- [x] 5.2 Map CheckPredicateFailedError to CLI Text Repair Guide
      `packages/cli/src/rendering/repair-guide.ts`: `writeTextRepairGuide` — format unified check failure diagnostics
      Approach: Catch `CheckPredicateFailedError`; print check label and error code; render `command:` if provided; render `bypass: Retry with --skip-checks <id> if an exception is granted` if matching binding declares `skippable: true`.
      (Req: Invalid transition error)

- [x] 5.3 Render hook execution warnings in CLI run-hooks command
      `packages/cli/src/commands/changes/run-hooks.ts`: `runHooksCommand` — print warnings for non-blocking hook failures
      Approach: Inspect `RunStepHooksResult.warnings`; render formatted warning blocks with hook id, exit code, and stderr lines without exiting code 1.
      (Req: Post-hook failure warning)

## 6. Automated Tests & Quality Assurance

- [x] 6.1 Unit tests for CheckRegistry and deepMergeConfig helper
      `packages/core/test/domain/services/check-registry.spec.ts`, `packages/core/test/domain/services/deep-merge-config.spec.ts`: test suites — verify check registry and deep merge helper
      Approach: Write unit tests covering namespacing (`@plugin.id`), built-in immutability, `InvalidPluginNameError`, `InvalidCheckKindError`, `DuplicateCheckError`, `DuplicateCheckBindingError`, and two-tier governance locks; test `deepMergeConfig` with nested records of records, arrays, and ignoredKeys.
      (Req: Open check registry, Canonical namespacing and plugin registration, Two-tier governance and confinement locks)

- [x] 6.2 Unit tests for built-in check bindings skippability permissions
      `packages/core/test/domain/services/check-bindings.spec.ts`: test suite — verify explicit skippability across bindings
      Approach: Assert `impl.linksInScope` and `spec.overlap` bindings declare `skippable: true`; assert all other 11 built-in predicate check bindings declare `skippable: false`.
      (Req: Registry bindings for this capability)

- [x] 6.3 Unit tests for schema check validation in buildSchema
      `packages/core/test/domain/services/build-schema.spec.ts`: test suite — verify check declaration validation
      Approach: Test rejection of unregistered check IDs (`UnknownCheckError`), coordinate duplicates (`DuplicateCheckBindingError`), confinement violations (`CheckEmbeddingForbiddenError`), and locked config overrides (`CheckConfigOverrideForbiddenError`).
      (Req: Check declarations and governance validation)

- [x] 6.4 Use case tests for TransitionChange with skipChecks
      `packages/core/test/application/use-cases/transition-change.spec.ts`: test suite — verify transition execution with bypasses
      Approach: Test successful bypass of `impl.linksInScope`; test rejection of mandatory check bypass with `CheckNotSkippableError`; test rejection of effect check bypass; test failure abort throwing `CheckPredicateFailedError`.
      (Req: Canonical pre-transition validity reconciliation, Shared runner errors propagate on transition)

- [x] 6.5 Use case tests for RunStepHooks with onFailure warn
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`: test suite — verify resilient hook execution
      Approach: Execute hook with `onFailure: 'warn'` exiting with code 1; assert `success === true`, `failedHooks` is empty, and `warnings` contains failure record with exitCode, stdout, and stderr.
      (Req: Pre-hook failure semantics, Post-hook failure semantics)

- [x] 6.6 Use case tests for GetStatus check blocker projection
      `packages/core/test/application/use-cases/get-status.spec.ts`: test suite — verify dynamic blocker derivation
      Approach: Assert failing skippable check projects `bypassFlag: '--skip-checks <id>'`; assert remediation command is reflected in `nextAction`.
      (Req: Actionable fail diagnostics, Projections)

- [x] 6.7 CLI integration tests for --skip-checks and Repair Guide
      `packages/cli/test/commands/changes/transition.spec.ts`: test suite — test CLI command behavior
      Approach: Execute transition with `--skip-checks`; verify legacy flag translation; verify Repair Guide output formatting for `CheckPredicateFailedError`.
      (Req: Command signature, Invalid transition error)

## 7. Documentation & Architecture Decision Record

- [x] 7.1 Author integrator documentation for custom checks
      `docs/core/custom-checks.md`: new developer guide — document Check vs Hook architecture and plugin authoring
      Approach: Write comprehensive integrator guide covering `CustomCheckDefinition`, namespacing, `ctx.config`, governance locks, builder registration, and complete code examples.
      (Req: Open check registry, Public CustomCheckDefinition contract)

- [x] 7.2 Update user and agent workflow guides
      `docs/guide/schemas.md`, `docs/guide/workflow.md`, `docs/guide/configuration.md`, `docs/guide/cli.md`: user guides — document checks and resilient hooks
      Approach: Update `schemas.md` with `checks:` and `onFailure: warn` syntax; update `cli.md` with `--skip-checks` and Repair Guide troubleshooting; update `workflow.md` with resilient hook execution.
      (Req: Resilient hook failure policy, Step check declarations, Command signature)

- [x] 7.3 Create Architectural Decision Record
      `docs/adr/0030-open-check-registry-and-hook-failure-policies.md`: new ADR — record architectural decision
      Approach: Document context, decision, consequences, options hierarchy, and migration from static `CheckId` to open `CheckRegistry`.
      (Req: Open check registry)

## 8. Check Disablement Governance (allowDisable & disabled: true)

- [x] 8.1 Extend governance contracts with allowDisable and CheckDisableForbiddenError
      `packages/core/src/domain/services/check-registry.ts`, `packages/core/src/domain/services/transition-checks.ts`, `packages/core/src/domain/errors/check-registry-errors.ts`: `allowDisable` & `CheckDisableForbiddenError` — add disablement governance locks and typed domain error
      Approach: Add `allowDisable?: boolean` to `CheckGovernance`, `PluginCheckRegistrationOptions`, `CheckBindingSpec`, and `CheckBinding`; export `CheckDisableForbiddenError` extending `SpecdError`; mark core protocol invariants with `allowDisable: false`.
      (Req: Disablement Governance, Immutability of allowDisable)

- [x] 8.2 Add disabled property to WorkflowStepCheckDeclaration and validate in buildSchema
      `packages/core/src/domain/value-objects/workflow-step.ts`, `packages/core/src/domain/services/build-schema.ts`: `disabled` support & validation — validate disablement against governance locks
      Approach: Add `disabled?: boolean` to `WorkflowStepCheckDeclaration`; in `buildSchema`, when `chk.disabled === true`, assert that neither the check nor any matching existing binding has `allowDisable: false`, otherwise throw `CheckDisableForbiddenError`; enforce that schemas cannot relax an existing binding's `allowDisable: false`.
      (Req: Check declarations and governance validation, Disablement Governance)

- [x] 8.3 Integrate disabled checks filtering into predicate execution
      `packages/core/src/application/services/execute-matching-predicates.ts`, `packages/core/src/application/use-cases/transition-change.ts`: predicate execution — filter out disabled step checks
      Approach: In predicate matching, checks declared with `disabled: true` on the target step are omitted from execution for that coordinate.
      (Req: Step check declarations, Disablement Governance)

- [x] 8.4 Unit tests for allowDisable governance, non-relaxation, and execution filtering
      `packages/core/test/domain/services/build-schema.spec.ts`, `packages/core/test/domain/services/check-registry.spec.ts`, `packages/core/test/application/services/execute-matching-predicates.spec.ts`: test suite — verify disablement locks and behavior
      Approach: Test rejection of `disabled: true` when check or binding has `allowDisable: false`; test non-relaxation invariant (schema cannot relax existing binding lock); test clean omission when `disabled: true` is permitted.
      (Req: Check declarations and governance validation, Disablement Governance)

- [x] 8.5 Enforce Monotonic Governance Rule across schema layer mergers
      `packages/core/src/domain/services/merge-schema-layers.ts`, `packages/core/test/domain/services/merge-schema-layers.spec.ts`: monotonic governance across mergers — ensure layer merges preserve checks without clobbering
      Approach: Implement safe array merging for `step.checks` in `applyWorkflowMutations` via `addToArray` with coordinate collision detection; verify through unit tests that extending layers cannot erase, delete, or relax governance locks.
      (Req: Two-tier governance and confinement locks, Monotonic Governance Rule Across Mergers and Layers)

## 9. Built-in Checks Three-Tier Governance & Schema Embedding

- [x] 9.1 Configure built-in governance in CheckRegistry
      `packages/core/src/domain/services/check-registry.ts`: `CheckRegistry` constructor — assign explicit Category A and Category C governance
      Approach: Set `allowBindingOverride: false` and `allowDisable: false` for Category A checks (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`); set `allowBindingOverride: true` and `allowDisable: true` for Category C checks (`impl.linksInScope`, `spec.overlap`, `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`).
      (Req: Built-in Checks Governance Categorization)

- [x] 9.2 Refactor check embedding validation in buildSchema
      `packages/core/src/domain/services/build-schema.ts`: `buildSchema` — remove `startsWith('@')` guard and rely on governance locks
      Approach: Replace `!chk.id.startsWith('@')` check with `governance.allowBindingOverride === false` check, allowing Category C built-ins to be declared and customized while cleanly rejecting Category A invariants with `CheckEmbeddingForbiddenError`.
      (Req: Check-Level Confinement, Check declarations and governance validation)

- [x] 9.3 Unit tests for Category A rejection and Category C acceptance
      `packages/core/test/domain/services/build-schema.spec.ts`: test suite — verify built-in check embedding behavior
      Approach: Test that Category A checks throw `CheckEmbeddingForbiddenError` when declared in `step.checks`; test that Category C checks (`impl.linksInScope`, `deps.consistent`, etc.) can be embedded in `step.checks` and declaratively disabled with `disabled: true`.
      (Req: Built-in Checks Governance Categorization, Check declarations and governance validation)

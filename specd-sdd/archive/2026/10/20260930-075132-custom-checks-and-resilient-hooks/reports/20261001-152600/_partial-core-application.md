# Partial Compliance Findings - Core Application

## Summary of Findings

- **Total Specs Audited**: 4
- **Total Requirements Audited**: 73
- **Conformant Requirements**: 73
- **Discrepancies / Drift**: 0
- **Missing Tests**: 0
- **Overall Status**: COMPLIANT

| Specification                                                                                                                                                | Requirements | Scenarios |    Status     | Discrepancies | Missing Tests |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------: | :-------: | :-----------: | :-----------: | :-----------: |
| [`core:transition-change`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/transition-change/spec.md)       |      29      |    69     |   COMPLIANT   |       0       |       0       |
| [`core:workflow-model`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/workflow-model/spec.md)             |      11      |    36     |   COMPLIANT   |       0       |       0       |
| [`core:hook-execution-model`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/hook-execution-model/spec.md) |      13      |    40     |   COMPLIANT   |       0       |       0       |
| [`core:kernel`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/kernel/spec.md)                             |      20      |    47     |   COMPLIANT   |       0       |       0       |
| **Total**                                                                                                                                                    |    **73**    |  **192**  | **COMPLIANT** |     **0**     |     **0**     |

---

## Per-Spec Assessment

### 1. `core:transition-change`

- **Spec Preview Source**: `node packages/cli/dist/index.js change spec-preview custom-checks-and-resilient-hooks core:transition-change`
- **Spec Documents**:
  - Spec: [`specs/core/transition-change/spec.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/transition-change/spec.md)
  - Verify: [`specs/core/transition-change/verify.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/transition-change/verify.md)
  - Deltas: [`specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/transition-change/`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/transition-change/)
- **Implementation Files**:
  - [`transition-change.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/transition-change.ts)
  - [`execute-matching-predicates.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/services/execute-matching-predicates.ts)
  - [`check-predicate-failed-error.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/check-predicate-failed-error.ts)
  - [`check-registry-errors.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/errors/check-registry-errors.ts)
- **Test Coverage**:
  - [`transition-change.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/transition-change.spec.ts) (112 tests, 100% passing)
  - [`execute-matching-predicates.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/services/execute-matching-predicates.spec.ts) (8 tests, 100% passing)

#### Requirements & Delta Verification:

1. **Input contract** (Delta modified):
   - Accepts `TransitionChangeInput` with `name`, `to`, `skipChecks?: readonly string[]`, `skipHookPhases?: ReadonlySet<HookPhaseSelector>`, and `onProgress`.
   - Ad-hoc boolean flags (`allowOutOfScope`, `allowOverlap`) are deprecated and normalized internally into `skipChecks: ['impl.linksInScope', 'spec.overlap']`.
2. **Canonical pre-transition validity reconciliation** (Delta modified):
   - Queries `CheckRegistry` and active schema step declarations (`workflowStep?.checks ?? []`).
   - Step checks marked with `disabled: true` are cleanly omitted from predicate evaluation (`stepDecl?.disabled === true => continue`).
   - Validates `skipChecks`: throws `UnknownCheckError` if check ID is not registered; throws `CheckNotSkippableError` if check is an effect (`kind: 'effect'`) or non-skippable (`skippable !== true`).
   - Skippable checks in `skipChecks` produce synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }`.
   - Cascading configuration correctly merges check-default config, binding config, and step-specific config before invoking `check.execute(ctx)`.
3. **Shared runner errors propagate on transition** (Delta modified):
   - All lifecycle predicate check failures throw the unified domain error `CheckPredicateFailedError`, encapsulating `checkId`, `label`, `code`, `message`, `command`, `details`, and `skippable`.
   - Retired legacy error classes (`ArchiveImplementationStateError`, `ArchiveDependencyMismatchError`) from `_mapFailedPredicate`.
4. **All baseline requirements verified**:
   - Change existence check throwing `ChangeNotFoundError`.
   - Gate configuration baked at construction (`approvals.spec`, `approvals.signoff`).
   - Happy-path `to: 'next'` resolution with `HAPPY_PATH_NEXT` map and `HappyPathNextUnavailableError` when unavailable.
   - Requires enforcement, task completion gating, tracking refresh, backward hop invalidation, and entity mutation serialization via `ChangeRepository.mutate`.

- **Discrepancies**: None.
- **Missing Tests**: None.
- **Verdict**: ✓ COMPLIANT (29/29 requirements, 69/69 scenarios).

---

### 2. `core:workflow-model`

- **Spec Preview Source**: `node packages/cli/dist/index.js change spec-preview custom-checks-and-resilient-hooks core:workflow-model`
- **Spec Documents**:
  - Spec: [`specs/core/workflow-model/spec.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/workflow-model/spec.md)
  - Verify: [`specs/core/workflow-model/verify.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/workflow-model/verify.md)
  - Deltas: [`specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/workflow-model/`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/workflow-model/)
- **Implementation Files**:
  - [`workflow-step.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/value-objects/workflow-step.ts)
  - [`build-schema.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/services/build-schema.ts)
  - [`merge-schema-layers.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/services/merge-schema-layers.ts)
  - [`lifecycle-verdict.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/services/lifecycle-verdict.ts)
- **Test Coverage**:
  - [`build-schema.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/services/build-schema.spec.ts) (51 tests, 100% passing)
  - [`merge-schema-layers.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/services/merge-schema-layers.spec.ts) (15 tests, 100% passing)
  - [`workflow-requires.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/checks/workflow-requires.spec.ts) (4 tests, 100% passing)
  - [`lifecycle-verdict.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/domain/services/lifecycle-verdict.spec.ts) (16 tests, 100% passing)

#### Requirements & Delta Verification:

1. **Step check declarations** (Delta added):
   - Defined `WorkflowStepCheckDeclaration` with `id`, `from`, `along`, `onFailure`, `skippable`, `disabled`, and `config`.
   - `WorkflowStep` exposes optional `checks?: readonly WorkflowStepCheckDeclaration[]`.
   - In `build-schema.ts`, checks are validated against `CheckRegistry`:
     - Defaults `along` to `'forward'` when omitted.
     - Preserves `disabled` boolean flag on the normalized step check declaration.
     - Validates governance locks: prevents embedding checks with `allowBindingOverride: false`, prevents overriding binding properties when locked, and prevents disabling checks with `allowDisable: false`.
2. **Hook failure policy type**:
   - `HookFailurePolicy` (`'abort' | 'warn'`) defined and parsed in `HookEntry` for `run` and `external` hooks.
3. **All baseline requirements verified**:
   - Step names reference domain lifecycle states.
   - Step semantics for failure and review states.
   - Requires-based gating and task completion gating using `CountTasks`.
   - Step availability recomputed on each invocation.
   - Step-to-state 1:1 identity.
   - Workflow array order as display order and axis for `along` classification (`forward`, `backward`, `recovery`, `redesign`).

- **Discrepancies**: None.
- **Missing Tests**: None.
- **Verdict**: ✓ COMPLIANT (11/11 requirements, 36/36 scenarios).

---

### 3. `core:hook-execution-model`

- **Spec Preview Source**: `node packages/cli/dist/index.js change spec-preview custom-checks-and-resilient-hooks core:hook-execution-model`
- **Spec Documents**:
  - Spec: [`specs/core/hook-execution-model/spec.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/hook-execution-model/spec.md)
  - Verify: [`specs/core/hook-execution-model/verify.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/hook-execution-model/verify.md)
  - Deltas: [`specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/hook-execution-model/`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/hook-execution-model/)
- **Implementation Files**:
  - [`run-step-hooks.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/use-cases/run-step-hooks.ts)
  - [`hook-effect-shared.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/application/checks/hook-effect-shared.ts)
  - [`workflow-step.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/domain/value-objects/workflow-step.ts)
- **Test Coverage**:
  - [`run-step-hooks.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/run-step-hooks.spec.ts) (35 tests, 100% passing)
  - [`transition-change.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/application/use-cases/transition-change.spec.ts) (hook execution semantics & phase skipping)

#### Requirements & Delta Verification:

1. **Resilient hook failure policy** (Delta added):
   - Hook entries (`type: 'run'` and `type: 'external'`) support `onFailure: 'abort' | 'warn'`.
   - `onFailure: 'abort'` (default): Non-zero exit code halts execution immediately; marks `RunStepHooksResult.success = false`.
   - `onFailure: 'warn'`: Non-zero exit code does NOT halt execution; exitCode, stdout, and stderr are captured into `warnings` collection, emitted via `hook-warning` telemetry, and remaining hooks continue.
2. **Pre-hook failure semantics** (Delta modified):
   - Pre-hooks with `onFailure: 'abort'` halt phase immediately and set `success: false`.
   - Pre-hooks with `onFailure: 'warn'` continue execution. If all failed hooks had `'warn'`, overall phase reports `success: true` with populated `warnings`.
   - Internal `hook.pre` effect check in `hook-effect-shared.ts` evaluates to `pass` when `RunStepHooksResult.success` is true, permitting transition to proceed without blocking on advisory warnings.
3. **Post-hook failure semantics** (Delta modified):
   - Post-hooks with `onFailure: 'abort'` halt and report `success: false`.
   - Post-hooks with `onFailure: 'warn'` log non-fatal failure in `warnings` and report `success: true`.
4. **All baseline requirements verified**:
   - Three hook entry forms: `run`, `instruction`, `external`.
   - External hook registration, dispatch, and phase semantics.
   - Instructions as passive text.
   - Granular hook control with `skipHookPhases` (`source.pre`, `source.post`, `target.pre`, `target.post`, `all`).
   - Template variable expansion with `HookRunner` (`{{change.name}}`, `{{project.root}}`, etc., with unknown variables left verbatim).

- **Discrepancies**: None.
- **Missing Tests**: None.
- **Verdict**: ✓ COMPLIANT (13/13 requirements, 40/40 scenarios).

---

### 4. `core:kernel`

- **Spec Preview Source**: `node packages/cli/dist/index.js change spec-preview custom-checks-and-resilient-hooks core:kernel`
- **Spec Documents**:
  - Spec: [`specs/core/kernel/spec.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/kernel/spec.md)
  - Verify: [`specs/core/kernel/verify.md`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specs/core/kernel/verify.md)
  - Deltas: [`specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/kernel/`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/specd-sdd/changes/20260930-075132-custom-checks-and-resilient-hooks/deltas/core/kernel/)
- **Implementation Files**:
  - [`kernel.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/kernel.ts)
  - [`kernel-builder.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/kernel-builder.ts)
  - [`composition-registries.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/composition-registries.ts)
  - [`composition-resolver.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/composition-resolver.ts)
  - [`workflow-check-registry.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/src/composition/use-cases/workflow-check-registry.ts)
- **Test Coverage**:
  - [`kernel.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/composition/kernel.spec.ts) (16 tests, 100% passing; includes full "Kernel custom checks end-to-end" suite)
  - [`kernel-builder.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/composition/kernel-builder.spec.ts) (5 tests, 100% passing)
  - [`workflow-check-registry.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/composition/use-cases/workflow-check-registry.spec.ts) (9 tests, 100% passing)
  - [`barrel-kernel-coverage.spec.ts`](file:///Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/core/test/barrel-kernel-coverage.spec.ts) (1 test, 100% passing)

#### Requirements & Delta Verification:

1. **KernelOptions supports additive registries** (Delta modified):
   - `KernelOptions` and `CompositionRegistryInput` accept additive `checks?: readonly PluginCheckRegistration[]` in addition to `schemas`, `tasks`, `parsers`, `storages`, and `externalHookRunners`.
   - `PluginCheckRegistration` provides `pluginName`, `check`, `defaultConfig`, `allowConfigOverride`, `allowBindingOverride`, `options`, and `defaultBindings`.
2. **Check Registration and KernelBuilder Extension** (Delta added):
   - `KernelBuilder` in `@specd/core/extensions` provides fluent `registerCheck(pluginName, check, defaultBindings?, options?)` method returning `this`.
   - Delegates check registration to underlying `CheckRegistry`, ensuring `@pluginName.id` namespacing, setting `kind: 'predicate'`, and recording governance options (`allowConfigOverride`, `allowBindingOverride`, `allowDisable`).
   - The built `Kernel` exposes the active check registry view under `kernel.registry.checks` for inspection, observability, and tooling.
   - `resolveWorkflowCheckRegistry` securely filters external bindings, ensuring internal built-in checks are never shadowed or clobbered by rogue definitions.
3. **All baseline requirements verified**:
   - Grouping use cases by domain area (`changes`, `specs`, `project`, `registry`).
   - Adapters constructed once and shared across all use cases.
   - Auto-detection for VCS and Actor adapters.
   - Auto-invalidation on get when artifact files drift (`artifact-drift`).
   - Kernel is a plain, immutable object with no lifecycle or mutating methods.

- **Discrepancies**: None.
- **Missing Tests**: None.
- **Verdict**: ✓ COMPLIANT (20/20 requirements, 47/47 scenarios).

---

## Global Specs Consistency

The core application implementation and test suite were checked against all monorepo global specifications:

1. **`default:_global/architecture`**:
   - Hexagonal architecture strictly honored: `domain/` contains zero I/O; `application/` interacts exclusively through ports; `composition/` wires dependencies without exposing infrastructure adapters; `Kernel` is an immutable plain object facade.
   - Public entry points (`"."`, `"./ports"`, `"./extensions"`, `"./internal"`) curated in `package.json` with no leaks of concrete adapters.
2. **`default:_global/conventions`**:
   - TypeScript strict mode compliance, explicit typing, immutability conventions (`readonly`), and diagnostic logging routed exclusively through the ambient `Logger` facade.
3. **`default:_global/testing`**:
   - Vitest test suites executed with fast, clean, deterministic results. Entire `@specd/core` suite passes (234 test files, 2,894 tests).
4. **`default:_global/error-handling-conventions`**:
   - All errors (`CheckPredicateFailedError`, `CheckNotSkippableError`, `UnknownCheckError`, `CheckDisableForbiddenError`, `CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`) inherit from `SpecdError`, carry `readonly specd = true`, expose machine-readable uppercase snake-case `code` properties, provide descriptive messages, and are documented in JSDoc with `@throws`.

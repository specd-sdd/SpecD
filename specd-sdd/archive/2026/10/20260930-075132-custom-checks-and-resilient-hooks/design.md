# Technical Design: Custom Checks and Resilient Hooks

## 1. Overview & Problem Statement

SpecD lifecycle transitions were previously governed by a closed union of 15 built-in checks (`CheckId`) mapped across static applicability tables (`TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`), preventing plugins, extensions, and custom workflow schemas from introducing first-class verification rules. Concurrently, workflow transition hooks operated under an unyielding fail-fast policy in the `pre` phase, where any non-zero exit code immediately blocked transitions, compelling developers to resort to fragile shell constructs such as `|| true` that destroyed execution visibility and masked process exit codes. Furthermore, check bypasses relied on ad-hoc CLI flags (`--allow-out-of-scope`, `--allow-overlap`) that bled directly into use case inputs, while check failure errors were fragmented into duplicated, bespoke error classes.

This technical design defines:

1. An open, immutable, and namespaced **`CheckRegistry`** domain service.
2. A clean, ergonomic public contract (`CustomCheckDefinition`) for plugin authors that automatically stamps `kind: 'predicate'`.
3. Two-tier governance and configuration cascading (check-level confinement locks vs coordinate-level policy locks, isolated `ctx.config`).
4. Dual-source semantics for `outcome: 'skip'` (self-discarding checks vs orchestrator `--skip-checks` bypass).
5. Explicit audit matrix and skippability permissions across all check bindings, retiring ad-hoc bypass flags.
6. Unified error abstraction via **`CheckPredicateFailedError`**, retiring duplicated error classes.
7. Resilient hook failure policies (`onFailure: 'abort' | 'warn'`) with non-blocking error collection into `warnings[]`.
8. Declarative schema bindings in `schema.yaml` validated by `buildSchema`.
9. Dual-form kernel composition (`createKernel` and fluent `KernelBuilder`).
10. Unified CLI `--skip-checks` flag and structured Text Repair Guide integration.

---

## 2. Hexagonal Architecture & Layer Boundaries

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   CLI ADAPTER                                    │
│  commands/changes/transition.ts      commands/changes/run-hooks.ts               │
│  - Parses --skip-checks <ids>         - Renders warnings for non-blocking hooks  │
│  - Maps legacy aliases               rendering/repair-guide.ts                   │
│    (--allow-out-of-scope,             - Formats CheckPredicateFailedError       │
│     --allow-overlap)                  - Suggests remediation & bypass            │
└─────────────────────────────────────────┬────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             APPLICATION USE CASES                                │
│                                                                                  │
│  TransitionChange (lifecycle/transition-change.ts)                               │
│  - Accepts skipChecks?: readonly string[]                                        │
│  - Intercepts skippable checks (CheckNotSkippableError on violation)             │
│  - Injects synthetic { outcome: 'skip' }                                         │
│  - Throws unified CheckPredicateFailedError on failure                           │
│                                                                                  │
│  GetStatus (lifecycle/get-status.ts)                                             │
│  - Evaluates matching checks against nextAction.targetStep                       │
│  - Dynamically projects bypassFlag: '--skip-checks ' + id for skippable checks   │
│  - Projects remediation command into nextAction                                  │
│                                                                                  │
│  RunStepHooks (lifecycle/run-step-hooks.ts)                                      │
│  - Respects onFailure: 'abort' | 'warn'                                          │
│  - Aggregates non-blocking errors into warnings[]                                │
│  - Returns success: true if all failures had onFailure: 'warn'                   │
│                                                                                  │
│  buildSchema (services/build-schema.ts)                                          │
│  - Validates schema step checks against CheckRegistry                            │
│  - Enforces coordinate uniqueness & governance locks                             │
└─────────────────────────────────────────┬────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 DOMAIN SERVICES                                  │
│                                                                                  │
│  CheckRegistry (services/check-registry.ts)                                      │
│  - Constructor-injected built-in checks (immutable)                              │
│  - register(pluginName, check, defaultBindings?, options?)                       │
│  - Enforces canonical namespacing: @${pluginName}.${check.id}                    │
│  - Adapts CustomCheckDefinition -> Check with kind: 'predicate'                  │
│  - Asserts kind !== 'effect' (InvalidCheckKindError)                             │
│  - Enforces coordinate identity & two-tier governance locks                      │
│                                                                                  │
│  Transition Checks (services/transition-checks.ts)                               │
│  - Check: { id: string, label, kind, command?, execute }                         │
│  - CheckResult: { id, label, kind, outcome, code?, message?, command?, details? }│
│  - CheckExecutionContext: { change, schema, attempt, config, validity, ... }     │
│  - Built-in bindings: impl.linksInScope & spec.overlap (skippable: true), others │
│                                                                                  │
│  Workflow Step (value-objects/workflow-step.ts)                                  │
│  - WorkflowStepCheckDeclaration: { id, from?, along?, onFailure?, skippable?, ...│
│  - HookEntry: { id, type, command, onFailure?: 'abort' | 'warn' }                │
└─────────────────────────────────────────┬────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                COMPOSITION LAYER                                 │
│  createKernel (composition/create-kernel.ts)                                     │
│  - CompositionRegistryInput.checks?: readonly PluginCheckRegistration[]          │
│  - Instantiates unified CheckRegistry and wires use cases                        │
│                                                                                  │
│  KernelBuilder (composition/kernel-builder.ts)                                   │
│  - registerCheck(pluginName, check, defaultBindings?, options?): this            │
│  - Exposes kernel.registry.checks view                                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Structures & Core Type Contracts

### 3.1 Public Authoring Contract: `CustomCheckDefinition`

External plugin authors implement `CustomCheckDefinition`. Engine internals (`kind`) and lifecycle routing policies (`skippable`) are omitted for developer ergonomics; skippability is configured strictly on bindings (`CheckBindingSpec` / `WorkflowStepCheckDeclaration`):

```typescript
export interface CustomCheckDefinition {
  /** Local check identifier (e.g. 'code-scan'); namespaced by registry to '@plugin.code-scan' */
  readonly id: string
  /** Canonical gerund label for diagnostics and UI logs (e.g. 'Scanning code for security vulnerabilities') */
  readonly label: string
  /** Default CLI remediation command suggested on failure */
  readonly command?: string
  /** Pure evaluation function */
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

### 3.2 Internal Domain Engine Contract: `Check`

Within `@specd/core`, all checks (built-ins and adapted plugin checks) satisfy the `Check` interface:

```typescript
export type CheckKind = 'predicate' | 'effect'
export type CheckOutcome = 'pass' | 'fail' | 'skip'

export interface Check {
  readonly id: string
  readonly label: string
  readonly kind: CheckKind
  readonly command?: string
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}

export interface CheckResult {
  readonly id: string
  readonly label: string
  readonly kind: CheckKind
  readonly outcome: CheckOutcome
  readonly code?: string
  readonly message?: string
  readonly command?: string
  readonly details?: Readonly<Record<string, unknown>>
}

export interface CheckExecutionContext {
  readonly change: Change
  readonly schema: Schema
  readonly attempt: TransitionAttempt
  readonly config?: Readonly<Record<string, unknown>>
  readonly validity?: ChangeValidityVerdict
  readonly onCheckProgress?: (progress: CheckProgressEvent) => void
}
```

### 3.3 Binding Coordinates and Declarations

```typescript
export type CheckScope = 'transition' | 'archive'

export interface CheckBindingCoordinate {
  readonly checkId: string
  readonly scope: CheckScope
  readonly to?: ChangeState
  readonly along?: TransitionAlong | '*'
}

export interface CheckBindingSpec {
  readonly applicability: readonly {
    readonly scope: CheckScope
    readonly to?: ChangeState
    readonly along?: TransitionAlong | '*'
  }[]
  readonly onFailure?: 'abort' | 'collect'
  readonly skippable?: boolean
  readonly allowBindingOverride?: boolean
  readonly allowConfigOverride?: boolean
  readonly allowDisable?: boolean
  readonly config?: Readonly<Record<string, unknown>>
}

export interface CheckBinding {
  readonly checkId: string
  readonly scope: CheckScope
  readonly to?: ChangeState
  readonly along?: TransitionAlong | '*'
  readonly onFailure: 'abort' | 'collect'
  readonly skippable: boolean
  readonly allowBindingOverride: boolean
  readonly allowConfigOverride: boolean
  readonly allowDisable: boolean
  readonly config?: Readonly<Record<string, unknown>>
}

export interface WorkflowStepCheckDeclaration {
  readonly id: string
  readonly from?: ChangeState | '*'
  readonly along?: TransitionAlong | '*'
  readonly onFailure?: 'abort' | 'collect'
  readonly skippable?: boolean
  readonly disabled?: boolean
  readonly config?: Readonly<Record<string, unknown>>
}
```

### 3.4 Resilient Hooks Contract

```typescript
export type HookFailurePolicy = 'abort' | 'warn'

export interface RunHookEntry {
  readonly id: string
  readonly type: 'run'
  readonly command: string
  readonly onFailure?: HookFailurePolicy // default: 'abort'
}

export interface ExternalHookEntry {
  readonly id: string
  readonly type: 'external'
  readonly name: string
  readonly config?: Readonly<Record<string, unknown>>
  readonly onFailure?: HookFailurePolicy // default: 'abort'
}

export interface RunStepHooksResult {
  readonly hooks: readonly RunStepHookEntry[]
  readonly failedHooks: readonly RunStepHookEntry[]
  readonly warnings: readonly RunStepHookEntry[]
  readonly success: boolean // true if all failed hooks had onFailure: 'warn'
}
```

---

## 4. Two-Tier Governance, Monotonic Locks & Configuration Cascade Resolution

### 4.1 Governance Locks & Principle of Monotonic Governance Locks

1. **Check-Level Confinement (`allowBindingOverride`)**:
   - `allowBindingOverride: false`: Check cannot be embedded into any workflow step in `schema.yaml` beyond its declared `defaultBindings`. Violations throw `CheckEmbeddingForbiddenError`.
   - Defaults: `false` if `defaultBindings` are provided; `true` if `defaultBindings` are omitted.
2. **Binding-Level Policy Lock (`allowBindingOverride`)**:
   - `allowBindingOverride: false` on a specific coordinate: `schema.yaml` cannot alter `onFailure` or `skippable` for that coordinate. Violations throw `CheckBindingOverrideForbiddenError`.
3. **Configuration Override Lock (`allowConfigOverride`)**:
   - `allowConfigOverride: false`: `schema.yaml` cannot provide or override `config`. Violations throw `CheckConfigOverrideForbiddenError`.
4. **Disablement Governance Lock (`allowDisable`)**:
   - `allowDisable: false` (Check-level): Check cannot be disabled in `schema.yaml` via `disabled: true` anywhere in the workflow. Core protocol invariants (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`) enforce `allowDisable: false`.
   - `allowDisable: false` (Binding-level): Specific coordinate cannot be disabled in `schema.yaml`.
   - Any attempt to declare `disabled: true` when `allowDisable: false` is enforced throws `CheckDisableForbiddenError`.
5. **Monotonic Governance Rule (Principle of Monotonic Governance Locks)**:
   - All governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) operate strictly under monotonic restriction: once an invariant or binding establishes a lock (`false`), it CANNOT be erased, deleted, relaxed, or overwritten by subsequent schema layers, redeclarations of the same binding, or AST mergers (`merge-schema-layers`).
   - In `merge-schema-layers.ts`, schema layers safely merge `step.checks` arrays using identity collision validation (`addToArray`), ensuring that extending schema layers cannot accidentally clobber or erase existing check declarations and governance restrictions.
   - Any attempt to redeclare an identical binding to downgrade or eliminate an existing governance lock is strictly rejected.

### 4.2 Declarative Disablement (`disabled: true`) vs Runtime Bypass (`skippable` / `--skip-checks`)

- **Declarative Disablement (`disabled: true`)**: Defined declaratively at design time in `schema.yaml` within a step's `checks:` block. When permitted (`allowDisable !== false`), the check is omitted entirely from matching predicate execution for that coordinate. It runs with zero overhead, generates no warnings, and represents an intentional architectural decision by the project schema author.
- **Runtime Bypass (`skippable: true` via `--skip-checks`)**: An operational, human-in-the-loop exception executed at runtime via the CLI. It requires `skippable: true` on the matching binding, records an audit verdict (`bypassedByUser: true`), and produces visibility in transitions. Mandatory invariants remain non-skippable.

### 4.3 Cascading Configuration Merge Algorithm & Reusable `deepMergeConfig` Helper

To support arbitrary nested records of records (`{ valor1: { leaf1: 1, leaf2: 2 }, valor2: "otra cosa" }`) without shallow-spread key obliteration, deep merge logic is extracted to a pure, reusable domain service helper: `packages/core/src/domain/services/deep-merge-config.ts`.

```typescript
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export interface DeepMergeConfigOptions {
  /** Optional keys to ignore during merge (e.g. 'extends', 'remove' in cascade) */
  readonly ignoredKeys?: readonly string[]
}

export function deepMergeConfig(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
  options?: DeepMergeConfigOptions,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  const ignored = new Set(options?.ignoredKeys ?? [])

  for (const [key, value] of Object.entries(overlay)) {
    if (ignored.has(key)) continue
    const existing = result[key]
    if (existing !== undefined && isRecord(existing) && isRecord(value)) {
      result[key] = deepMergeConfig(existing, value, options)
    } else if (Array.isArray(existing) && Array.isArray(value)) {
      result[key] = [...existing, ...value]
    } else {
      result[key] = value
    }
  }
  return result
}
```

Existing `deepMergeRawConfig` in `packages/core/src/application/ports/config-schema.ts` delegates to `deepMergeConfig(base, overlay, { ignoredKeys: ['extends', 'remove'] })`, preserving full backward compatibility across the config cascade.

When the orchestrator invokes a check for a transition attempt, it calculates `ctx.config` using this deep merge helper across the three cascading layers:

```typescript
function resolveEffectiveCheckConfig(
  checkRegistration: PluginCheckRegistration | undefined,
  binding: CheckBinding | undefined,
  stepDeclaration: WorkflowStepCheckDeclaration | undefined,
): Readonly<Record<string, unknown>> {
  let effective: Record<string, unknown> = {}

  if (checkRegistration?.defaultConfig) {
    effective = deepMergeConfig(effective, checkRegistration.defaultConfig)
  }
  if (binding?.config) {
    effective = deepMergeConfig(effective, binding.config)
  }
  if (stepDeclaration?.config) {
    effective = deepMergeConfig(effective, stepDeclaration.config)
  }

  return effective
}
```

---

## 5. Dual-Source Semantics of `outcome: 'skip'`

A check evaluation yields `skip` from one of two distinct paths:

1. **Check Self-Discard**:
   The check executes its logic and determines it is not applicable given current facts:
   ```typescript
   if (!ctx.config?.enabled) {
     return {
       id: this.id,
       label: this.label,
       kind: 'predicate',
       outcome: 'skip',
       message: 'Disabled in step config',
     }
   }
   ```
2. **Orchestrator Bypass (`--skip-checks`)**:
   The user explicitly passed the check's ID to `--skip-checks`.
   The orchestrator checks that the matching binding has `skippable === true`.
   If true, the orchestrator does NOT call `check.execute()`; it immediately records:
   ```typescript
   {
     id: check.id,
     label: check.label,
     kind: 'predicate',
     outcome: 'skip',
     details: { bypassedByUser: true },
   }
   ```
   If false, the orchestrator halts immediately and throws `CheckNotSkippableError`.

---

## 6. Three-Tier Governance & Audit Matrix for Built-in Checks

All 15 built-in checks in `@specd/core` are audited and classified into three distinct architectural categories with explicit governance permissions (`allowBindingOverride`, `allowDisable`, `skippable`):

- **Category A: Protocol & State Invariants (Strictly Locked)**: Non-negotiable core invariants. Locked against schema embedding (`allowBindingOverride: false`), schema disablement (`allowDisable: false`), and CLI bypass (`skippable: false`).
- **Category B: Native Step Attributes (Schema-Driven)**: Governed natively by dedicated step attributes (`step.requires: []`, `requiresTaskCompletion: true`, `approvals`). No need to redeclare in `step.checks: []`.
- **Category C: Policy & Consistency Checks (Declarable in Schema)**: Domain safety and consistency checks that project schemas can declare on workflow steps (`allowBindingOverride: true`), configure, or declaratively disable (`allowDisable: true`) when permitted.

| Check ID                  | Kind      | Category | `allowBindingOverride` | `allowDisable` | `skippable` | Invariant Category      | Code Modifications                                                                      |
| :------------------------ | :-------- | :------- | :--------------------: | :------------: | :---------: | :---------------------- | :-------------------------------------------------------------------------------------- |
| `protocol.edge`           | Predicate | **A**    |        `false`         |    `false`     |   `false`   | State Machine Integrity | Mandatory protocol invariant. Embedding or disabling throws typed error.                |
| `archive.archivable`      | Predicate | **A**    |        `false`         |    `false`     |   `false`   | State Invariant         | Mandatory archive invariant.                                                            |
| `schema.nameMatch`        | Predicate | **A**    |        `false`         |    `false`     |   `false`   | Schema Parity           | Mandatory archive parity invariant.                                                     |
| `verification.current`    | Predicate | **A**    |        `false`         |    `false`     |   `false`   | Evidence Freshness      | Mandatory freshness invariant before exiting `verifying`.                               |
| `hook.pre`                | Effect    | **A**    |        `false`         |    `false`     |     N/A     | Lifecycle Hook          | Lifecycle hook effect. Declared via `hooks.pre: []`. Bypassed via `--skip-hooks`.       |
| `hook.post`               | Effect    | **A**    |        `false`         |    `false`     |     N/A     | Lifecycle Hook          | Lifecycle hook effect. Declared via `hooks.post: []`. Bypassed via `--skip-hooks`.      |
| `workflow.requires`       | Predicate | **B**    |        `false`         |     Native     |   `false`   | Artifact Integrity      | Governed natively via `step.requires: []`. Empty array indicates no requirements.       |
| `workflow.taskCompletion` | Predicate | **B**    |        `false`         |     Native     |   `false`   | Checklist Governance    | Governed natively via `step.requiresTaskCompletion: true/false`.                        |
| `approval.spec`           | Predicate | **B**    |        `false`         |     Native     |   `false`   | Spec Signoff Gate       | Governed via workspace/schema `approvals.spec: on/off`. Self-discards if off.           |
| `approval.signoff`        | Predicate | **B**    |        `false`         |     Native     |   `false`   | Final Signoff Gate      | Governed via `approvals.signoff: on/off`.                                               |
| `impl.linksInScope`       | Predicate | **C**    |         `true`         |     `true`     | **`true`**  | Scope Boundary          | Set binding `skippable: true`. Declarable on steps; can be disabled (`disabled: true`). |
| `spec.overlap`            | Predicate | **C**    |         `true`         |     `true`     | **`true`**  | Concurrency Conflict    | Set binding `skippable: true`. Declarable on steps; can be disabled (`disabled: true`). |
| `deps.consistent`         | Predicate | **C**    |         `true`         |     `true`     |   `false`   | Graph Integrity         | Aciclicity check. Declarable on custom steps; can be disabled. Non-skippable in CLI.    |
| `impl.filesResolved`      | Predicate | **C**    |         `true`         |     `true`     |   `false`   | File Completeness       | Physical file check. Declarable on steps; can be disabled for doc-only flows.           |
| `workspace.readOnly`      | Predicate | **C**    |         `true`         |     `true`     |   `false`   | Filesystem Safety       | Safety check. Declarable on steps; can be disabled in sandbox flows.                    |

### 6.1 Schema Validation Engine Behavior in `buildSchema`

Instead of checking string syntax (`!chk.id.startsWith('@')`), `buildSchema` queries `CheckRegistry.getGovernance(chk.id)`:

1. If `chk.id` is not registered, throws `UnknownCheckError`.
2. If `governance.allowBindingOverride === false`, throws `CheckEmbeddingForbiddenError` (protects all Category A invariants).
3. If `chk.disabled === true` and `governance.allowDisable === false`, throws `CheckDisableForbiddenError`.
4. Checks in Category C declare `allowBindingOverride: true` and `allowDisable: true`, allowing project schemas to specialize them cleanly.

---

## 7. Unified Error Hierarchy & CLI Repair Guide

### 7.1 Unified `CheckPredicateFailedError`

All bespoke predicate error classes (`ArchiveImplementationStateError`, `ArchiveDependencyMismatchError`, etc.) in `TransitionChange._mapFailedPredicate` are deleted. All predicate failures throw:

```typescript
export class CheckPredicateFailedError extends SpecdError {
  constructor(
    public readonly checkId: string,
    public readonly label: string,
    public readonly code: string,
    message: string,
    public readonly command?: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(`Check '${checkId}' failed: ${message}`)
    this.name = 'CheckPredicateFailedError'
  }
}
```

### 7.2 CLI Text Repair Guide Formatting

When `CheckPredicateFailedError` is caught in `packages/cli/src/commands/changes/transition.ts`:

```text
error: Check '@security.code-scan' failed: Found 2 high-severity vulnerabilities
! SECURITY_VULNERABILITY — Scanning code for security vulnerabilities: Found 2 high-severity vulnerabilities

repair guide:
  state:   implementing
  target:  verifying
  command: pnpm audit:fix
  bypass:  Retry with --skip-checks @security.code-scan if an exception is granted
```

_(Note: The `bypass:` suggestion is dynamically omitted if `binding.skippable !== true`.)_

---

## 8. Resilient Hook Execution in `RunStepHooks`

In `packages/core/src/application/use-cases/lifecycle/run-step-hooks.ts`:

1. Loop over each `HookEntry` in the target phase (`pre` or `post`).
2. Execute hook via runner port.
3. If exit code !== 0:
   - If `hook.onFailure === 'warn'`:
     - Push record to `warnings: RunStepHookEntry[]`.
     - Emit progress event: `{ status: 'warning', message: 'Non-fatal hook failure' }`.
     - Do NOT set `failed = true`; continue to next hook.
   - If `hook.onFailure === 'abort'` (or omitted):
     - Push record to `failedHooks: RunStepHookEntry[]`.
     - Halt loop immediately.
4. Return `RunStepHooksResult`:
   - `success`: `failedHooks.length === 0`.
   - `warnings`: list of non-fatal hook failures.
5. In `HookEffectCheck`: Check outcome is `'pass'` if `result.success === true`. State transitions advance cleanly, while CLI prints hook warnings.

---

## 9. Code Graph Impact & Blast Radius

Running graph impact against `packages/core/src/domain/services/transition-checks.ts` demonstrates high coupling across use cases and CLI commands:

- **Direct Dependents**:
  - `packages/core/src/domain/services/check-bindings.ts`
  - `packages/core/src/application/use-cases/lifecycle/transition-change.ts`
  - `packages/core/src/application/use-cases/lifecycle/get-status.ts`
  - `packages/core/src/application/use-cases/lifecycle/archive-change.ts`
  - `packages/core/src/composition/create-kernel.ts`
  - `packages/cli/src/commands/changes/transition.ts`
  - `packages/cli/src/commands/changes/status.ts`
- **Mitigation**:
  - Open `CheckId` as `string` maintains string-literal compatibility for all existing call sites.
  - Legacy CLI flags (`--allow-out-of-scope`, `--allow-overlap`) are mapped transparently to `skipChecks` in the CLI layer, ensuring zero breaking changes for existing scripts or CI pipelines.

---

## 10. Testing Strategy

1. **Unit Tests**:
   - `packages/core/test/domain/services/check-registry.spec.ts`: Test `register`, namespacing, duplicate detection, `InvalidCheckKindError`, and `InvalidPluginNameError`.
   - `packages/core/test/domain/services/transition-checks.spec.ts`: Test check bindings with `skippable` permissions and `CheckResult` with `command`.
   - `packages/core/test/domain/services/build-schema.spec.ts`: Test check declarations validation, coordinate duplicate detection, and governance locks (`CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`).
2. **Use Case Tests**:
   - `packages/core/test/application/use-cases/transition-change.spec.ts`: Test `--skip-checks` bypass, `CheckNotSkippableError` rejection, and `CheckPredicateFailedError` mapping.
   - `packages/core/test/application/use-cases/run-step-hooks.spec.ts`: Test `onFailure: 'warn'` non-blocking hook failures, exit code and stdout/stderr preservation in `warnings[]`, and phase success.
   - `packages/core/test/application/use-cases/get-status.spec.ts`: Test dynamic check blocker projection and `nextAction` remediation command.
3. **Integration & CLI Tests**:
   - `packages/cli/test/commands/changes/transition.spec.ts`: Test `--skip-checks`, legacy flag translations, and Repair Guide output.
   - `packages/cli/test/commands/changes/run-hooks.spec.ts`: Test warning rendering.

---

## 11. Documentation Updates

1. **Integrator Guide**:
   - Create `docs/core/custom-checks.md`: Explaining Checks vs Hooks, the `CustomCheckDefinition` API, isolated `ctx.config`, governance rules, and builder registration.
2. **User & Agent Guides**:
   - Update `docs/guide/schemas.md`: Document `checks:` step syntax and `onFailure: warn` hook syntax.
   - Update `docs/guide/workflow.md` & `docs/guide/configuration.md`: Resilient hook execution.
   - Update `docs/guide/cli.md`: Repair Guide diagnostics and `--skip-checks` bypass syntax.
3. **Architecture Decision Record**:
   - Add `docs/adr/0030-open-check-registry-and-hook-failure-policies.md`.

# Proposal: custom-checks-and-resilient-hooks

## Motivation

SpecD lifecycle transitions are currently governed by a closed union of built-in checks (`CheckId`) with static domain applicability tables, preventing plugins, extensions, or custom schemas from introducing first-class verification rules. Simultaneously, lifecycle hooks execute under an inflexible fail-fast regime in the `pre` phase where any non-zero exit code halts transitions, forcing teams to rely on shell idioms like `|| true` that destroy observability and mask real failure statuses. Furthermore, the operational and conceptual boundary between in-memory deterministic state invariants (Checks) and asynchronous, side-effecting shell actions (Hooks) lacks explicit formal documentation for both users and developers.

This change opens the check architecture via a namespaced `CheckRegistry`, enables schema-level check declarations and resilient hook failure policies, introduces a uniform CLI bypass interface, and establishes clear user and developer documentation.

## Current behaviour

1. **Closed Check Definition**: `CheckId` is a hardcoded union of 15 string literals in `@specd/core` (`packages/core/src/domain/services/transition-checks.ts`). Check applicability is hardcoded in static arrays (`TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`). Third-party plugins or schemas cannot register or bind custom checks.
2. **All-or-Nothing Hook Failures**: `HookEntry` in `workflow-step.ts` has no failure tolerance configuration. `RunStepHooks` immediately aborts execution when any `pre` hook returns a non-zero exit code. Non-critical tasks (telemetry, advisory audits, notifications) must either use shell workarounds (`|| true`) or cause unintended transition blocks.
3. **Ad-Hoc CLI Flags & Use-Case Incoherence**: Bypassing checks relies on hardcoded CLI flags (`--allow-out-of-scope`, `--allow-overlap`) which bleed directly into Use-Case inputs (`TransitionChangeInput.allowOutOfScope`, `ArchiveChangeInput.allowOverlap`) and context facts. Furthermore, `GetStatus._mergeBlockers` relies on hardcoded branching (`linksInScopeSkippable`). There is no unified mechanism or permission model (`skippable: boolean`) defining mandatory vs bypassable invariants.
4. **Duplicated Error Abstractions**: `TransitionChange._mapFailedPredicate` maps specific built-in check IDs to highly specific, duplicated error classes (e.g. `ArchiveImplementationStateError`, `ArchiveDependencyMismatchError`). Unknown custom checks fall back to generic `InvalidStateTransitionError`, losing structured diagnostics.
5. **Documentation Gap**: Neither user documentation nor developer architecture documentation clearly contrasts the role of Checks (state queries visible in `status`) versus Hooks (side-effecting shell executions).

## Proposed solution

### 1. Open Check Registry (`CheckRegistry`) with Strict Namespacing

- **Eliminate Static `CheckId`**: Transition checks use open string identifiers. The source of truth for check existence is the runtime `CheckRegistry`.
- **Public API Contract**:

  ```typescript
  export interface CheckRegistry {
    /**
     * Registers a custom check provided by an external plugin.
     * Automatically adapts `CustomCheckDefinition` into an internal `Check` with `kind: 'predicate'`
     * and enforces canonical namespacing: `@${pluginName}.${check.id}`.
     *
     * @param pluginName - Mandatory non-empty plugin identifier (no '@' or '.')
     * @param check - The custom check definition with a plugin-local id
     * @param defaultBindings - Optional kernel-level global bindings
     * @param options - Optional check-level defaults and governance flags
     * @returns The canonical namespaced check identifier
     */
    register(
      pluginName: string,
      check: CustomCheckDefinition,
      defaultBindings?: readonly CheckBindingSpec[],
      options?: PluginCheckRegistration,
    ): string

    get(canonicalId: string): Check | undefined
    has(canonicalId: string): boolean
    list(): readonly Check[]
    bindings(): readonly CheckBinding[]
  }
  ```

- **Constructor-Injected Built-ins**: The `CheckRegistry` constructor in `@specd/core` takes built-in checks (`protocol.edge`, `workflow.requires`, etc.) as an immutable initial collection. The public interface does not expose any `registerBuiltin()` method.
- **Strict Predicate-Only Invariant & Developer Ergonomics**: Custom checks implemented by plugin authors use `CustomCheckDefinition`, which intentionally omits `kind` because all custom checks are inherently predicates. When registered, the kernel automatically stamps `kind: 'predicate'`. As a defensive runtime guard (e.g. against untyped JavaScript consumers), if a definition explicitly supplies a `kind` property other than `'predicate'`, registration throws `InvalidCheckKindError`. Side-effecting operations, external commands, and mutations are exclusively reserved for Workflow Hooks.
- **Two-Tier Governance & Configuration Hierarchy (Check-Level vs Binding-Level)**:
  - **Check-Level Registration** (`PluginCheckRegistration`):
    - `defaultConfig?: Readonly<Record<string, unknown>>`: Baseline configuration applied across all bindings of this check.
    - `allowConfigOverride?: boolean` (default: `false` when `defaultConfig` defined): Global permission governing whether schemas can override configuration.
    - `allowBindingOverride?: boolean` (default: `false` when `defaultBindings` specified, `true` when omitted): **Global embedding lock**. If `false`, the check CANNOT be embedded into any workflow steps in `schema.yaml` beyond its declared `defaultBindings` (rejection: `CheckEmbeddingForbiddenError`).
    - `allowDisable?: boolean` (default: `true` for custom checks, `false` for kernel protocol invariants): **Global disablement lock**. If `false`, the check CANNOT be disabled in `schema.yaml` via `disabled: true` anywhere in the workflow (rejection: `CheckDisableForbiddenError`).
  - **Binding-Level Declaration** (`CheckBindingSpec`):
    - **Binding Identity**: Each binding is uniquely identified by its coordinate `{ checkId, scope: 'transition', to, along }` (or `{ checkId, scope: 'archive' }`). Duplicate bindings with the exact same coordinate are rejected with `DuplicateCheckBindingError`.
    - `config?: Readonly<Record<string, unknown>>`: Overrides/augments check-level `defaultConfig` for this specific step.
    - `allowBindingOverride?: boolean` (default: inherits check-level flag): If `false`, protects this specific coordinate from having its `onFailure` or `skippable` modified. **It does not prevent the check from being bound to other steps** (which is governed strictly by the global check-level lock).
    - `allowConfigOverride?: boolean` (default: inherits check-level flag): If `false`, protects this specific step's config from being overridden in `schema.yaml` (rejection: `CheckConfigOverrideForbiddenError`).
    - `allowDisable?: boolean` (default: inherits check-level flag): If `false`, protects this specific coordinate from being disabled in `schema.yaml` via `disabled: true`.
  - **Granular Enforcement Matrix & Principle of Monotonic Governance Locks**:
    - Global `allowBindingOverride: false`: Confinement lock. The check cannot be embedded in any other workflow steps.
    - Step-specific `allowBindingOverride: false`: Policy lock on that coordinate only. The check's `onFailure` and `skippable` cannot be altered for that step, but if global allows, the check can still be bound to other steps.
    - `allowConfigOverride: false`: Parameter lock. Neither global nor step config can be overridden by `schema.yaml`.
    - `allowDisable: false`: Disablement lock. If enforced by the check or a prior matching binding, attempting `disabled: true` in `schema.yaml` throws `CheckDisableForbiddenError`.
    - **Monotonic Governance Rule (Principle of Monotonic Governance Locks)**: All governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) operate strictly under monotonic restriction (principle of least privilege). Once an invariant or binding establishes a governance lock (`false`), no subsequent schema redeclaration, schema layer merger (`extends`, `plugin`, `override`), or AST manipulation can delete, erase, or relax that lock to `true`. Schema layer mergers (`merge-schema-layers`) must preserve `step.checks` arrays without collision or accidental clobbering, and any attempt to redeclare an identical binding to downgrade or eliminate an existing governance lock is strictly rejected.
    - If `defaultBindings` is omitted: The check is registered as an unbound catalog capability whose lifecycle position, direction, failure policy, disablement policy, and config are delegated entirely to `schema.yaml`.
- **Enriched `CheckExecutionContext`**: `CheckExecutionContext` passed to `check.execute(ctx)` includes `readonly config?: Readonly<Record<string, unknown>>`, giving checks direct runtime access to their effective configuration (resolved via cascaded merge: check defaults -> binding defaults -> schema step config).
- **Enriched `CheckResult` Contract**:
  ```typescript
  export interface CheckResult {
    readonly id: string
    readonly label: string
    readonly kind: CheckKind // 'predicate' for all custom checks
    readonly outcome: 'pass' | 'fail' | 'skip'
    readonly code?: string
    readonly message?: string
    readonly command?: string // Suggested CLI command to remediate the failure
    readonly details?: Readonly<Record<string, unknown>>
  }
  ```
- **Dual-Source Semantics of `outcome: 'skip'`**:
  - `pass`: Invariant holds; transition proceeds.
  - `fail`: Invariant is violated; transition is blocked with diagnostics (`code`, `message`, `command`, `details`).
  - `skip`: The check does not block transition. A `skip` outcome originates from one of two sources:
    1. **Check Self-Discard (Context & Config)**: Both built-in checks (`approval.spec`, `verification.current`) and custom checks (`@security.scan`, `@qa.coverage`) can inspect their execution context (`ctx.schema`, step `config`, touched files, workspace flags). If the check determines that it does not apply (e.g. feature disabled in `config`, scope excluded, or prerequisites absent), the check returns `{ outcome: 'skip', message: '...' }` to self-discard cleanly without blocking.
    2. **Orchestrator Bypass (`--skip-checks`)**: If a check is applicable but the user explicitly bypasses it via CLI (`--skip-checks <id>`), the orchestrator asserts that the active binding declared `skippable: true`. If permitted, the orchestrator bypasses `check.execute()` entirely and records a synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }`. If the binding is non-skippable (`skippable === false`), the orchestrator throws `CheckNotSkippableError`.

### 2. Check Contract and Execution Lifecycle

#### Public Contract: `CustomCheckDefinition`

Plugin authors implement the ergonomic `CustomCheckDefinition`. Because all custom checks are strictly predicates and routing policies live on bindings, authors only implement the pure evaluation function without engine internals such as `kind` or transition bypass permissions:

```typescript
export interface CustomCheckDefinition {
  /** Local check identifier (e.g. 'code-scan'); namespaced by registry to '@plugin.code-scan' */
  readonly id: string
  /** Canonical gerund label for diagnostics and CLI output (e.g. 'Scanning code for security vulnerabilities') */
  readonly label: string
  /** Default CLI remediation command suggested on failure */
  readonly command?: string
  /** Pure evaluation function */
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

#### Internal Engine Contract: `Check`

Internally, the kernel represents both built-in and adapted plugin checks using the `Check` interface. In alignment with `@specd/core` architectural comments (_"A reusable check. Routing lives on CheckBinding, not on the check"_), `Check` contains only invariant definitions:

```typescript
export interface Check {
  /** Canonical check identifier (e.g. 'protocol.edge' or '@security.code-scan') */
  readonly id: string
  /** Canonical gerund label for diagnostics and CLI output */
  readonly label: string
  /** Predicate vs effect */
  readonly kind: CheckKind
  /** Default CLI remediation command suggested on failure */
  readonly command?: string
  /** Pure evaluation function */
  execute(ctx: CheckExecutionContext): Promise<CheckResult>
}
```

When registered via `CheckRegistry.register(pluginName, customCheckDef, ...)`, the registry automatically wraps `CustomCheckDefinition` into an internal `Check` with `kind: 'predicate'` and the canonical `@${pluginName}.${id}` prefix. Bypassability (`skippable: boolean`) lives on `CheckBinding` / `CheckBindingSpec` and `WorkflowStepCheckDeclaration`.

#### Execution Context (`CheckExecutionContext`)

When `execute(ctx)` runs, it receives read-only contextual facts:

- `ctx.change`: Active change aggregate (files, state, manifest, scope).
- `ctx.schema`: Resolved workflow schema.
- `ctx.attempt`: Transition scope (`from`, `to`, `along`).
- `ctx.config`: Effective configuration resolved for this check (kernel defaults merged with schema config).
- `ctx.validity`: Reconciled change validity verdict (artifact completeness, consistency).
- `ctx.onCheckProgress`: Optional callback for streaming diagnostic progress events during long checks.

#### Authoring Example

Check implementations inject external ports/adapters through their constructor/factory, while evaluation data is read from `ctx`:

```typescript
export function createSecurityScanCheck(scanner: SecurityScanner): CustomCheckDefinition {
  return {
    id: 'code-scan',
    label: 'Scanning code for security vulnerabilities',
    async execute(ctx: CheckExecutionContext): Promise<CheckResult> {
      const severity = (ctx.config?.severity as string) ?? 'high'
      const enabled = (ctx.config?.enabled as boolean) ?? true

      if (!enabled) {
        return skip('@security.code-scan', 'predicate', 'Security scan disabled in step config')
      }

      const issues = await scanner.scan(ctx.change.files, severity)
      if (issues.length === 0) {
        return pass('@security.code-scan')
      }

      return fail(
        '@security.code-scan',
        'SECURITY_VULNERABILITY',
        `Found ${issues.length} vulnerabilities with severity >= ${severity}`,
        'pnpm audit:fix',
        { count: issues.length, issues },
      )
    },
  }
}
```

#### Pipeline Execution in Orchestrator (`TransitionChange` and `GetStatus`)

During `specd changes transition <name> <target>`:

1. **Binding Composition**: Active bindings are assembled from built-in tables, kernel registrations, and the target step's `checks:` declarations.
2. **Attempt Matching**: Checks are filtered by `attempt.from`, `attempt.to`, and classified `along` direction.
3. **Bypass Interception (`--skip-checks`)**: If a check ID is present in `skipChecks`, the orchestrator asserts `skippable: true`. If allowed, `check.execute()` is bypassed entirely, recording `{ outcome: 'skip', details: { bypassedByUser: true } }`. If mandatory (`skippable: false`), it immediately halts with `CheckNotSkippableError`.
4. **Execution & Telemetry**: For each active check, the orchestrator constructs `CheckExecutionContext` with effective `config`, emits `check-start`, calls `await check.execute(ctx)`, and emits `check-done`.
5. **Failure Policy & Diagnostics**:
   - If `onFailure: 'abort'` (default), execution halts immediately and throws `CheckPredicateFailedError` formatted for the CLI Repair Guide.
   - If `onFailure: 'collect'`, failure is recorded in the collection and subsequent checks continue to provide comprehensive failure diagnostics.
6. **Status Projection (`GetStatus`)**: `GetStatus` runs matching predicates against the next happy-path state (`nextAction.targetStep`). If a check returns `fail`, it is projected as a visible blocker in `lifecycle.blockers` and incorporates its remediation command into `nextAction`.

### 3. Dual-Form Kernel Construction & Check Registration

In alignment with ADR-0018 (_Graduated Composition Levels_), custom checks can be registered into the kernel using both established composition mechanisms:

#### Form 1: Static Kernel Options (`createKernel(config, options)` & `openSpecdHost`)

`KernelOptions` (extending `CompositionRegistryInput`) accepts an additive `checks` array:

```typescript
export interface PluginCheckRegistration {
  readonly pluginName: string
  readonly check: CustomCheckDefinition
  readonly defaultConfig?: Readonly<Record<string, unknown>>
  readonly allowConfigOverride?: boolean
  readonly allowBindingOverride?: boolean
  readonly defaultBindings?: readonly CheckBindingSpec[]
}

export interface CompositionRegistryInput {
  // ... existing storageFactories, parsers, vcsProviders, etc.
  readonly checks?: readonly PluginCheckRegistration[]
}
```

Usage in tests, SDK, and static composition:

```typescript
const kernel = await createKernel(config, {
  checks: [
    {
      pluginName: 'security',
      check: securityAuditCheck,
      defaultConfig: { severity: 'high' },
      allowConfigOverride: true,
      allowBindingOverride: false, // Confined to ready: cannot be embedded in other steps
      defaultBindings: [
        {
          applicability: [{ scope: 'transition', to: 'ready', along: 'forward' }],
          config: { threshold: 3 }, // Step-specific override of severity default
        },
      ],
    },
  ],
})
```

#### Form 2: Fluent Kernel Builder (`createKernelBuilder(config)` via `@specd/core/extensions`)

`KernelBuilder` exposes a chained registration method:

```typescript
export interface KernelBuilder {
  // ... existing registerSpecStorage, registerParser, etc.

  /**
   * Registers a custom predicate check from a plugin into the kernel builder.
   * Automatically converts `CustomCheckDefinition` into internal `Check` with `kind: 'predicate'`.
   *
   * @param pluginName - Mandatory non-empty plugin identifier (no '@' or '.')
   * @param check - The custom predicate check definition
   * @param defaultBindings - Optional kernel-level global bindings
   * @param options - Optional check-level defaults and governance flags
   * @returns The same builder for fluent chaining
   */
  registerCheck(
    pluginName: string,
    check: CustomCheckDefinition,
    defaultBindings?: readonly CheckBindingSpec[],
    options?: {
      readonly defaultConfig?: Readonly<Record<string, unknown>>
      readonly allowConfigOverride?: boolean
      readonly allowBindingOverride?: boolean
    },
  ): this

  build(): Promise<Kernel>
}
```

Usage in builder pipelines:

```typescript
const kernel = await createKernelBuilder(config)
  .registerCheck('security', securityAuditCheck, readyBindings, {
    defaultConfig: { severity: 'high' },
    allowConfigOverride: true,
    allowBindingOverride: false,
  })
  .registerCheck('acme', licenseCheck, acmeBindings)
  .build()
```

In both forms:

- `pluginName` is strictly validated.
- `CustomCheckDefinition` is converted into an internal `Check` with `kind: 'predicate'` and canonical `@${pluginName}.${check.id}` namespacing.
- Defensive runtime check: if `check` explicitly specifies `kind` and it is not `'predicate'`, throws `InvalidCheckKindError`.
- Canonical namespacing `@${pluginName}.${check.id}` is enforced.
- The built kernel exposes `kernel.registry.checks` as part of the composition registry view for observability and tooling.

### 4. Declarative Schema Bindings (`schema.yaml`)

- Extend `WorkflowStep` in `packages/core/src/domain/value-objects/workflow-step.ts`:
  ```typescript
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
- YAML declaration syntax in `schema.yaml`:
  ```yaml
  workflow:
    - step: ready
      requires: [proposal, specs, design, tasks]
      checks:
        - id: '@security.code-scan'
          along: forward
          onFailure: abort # 'abort' | 'collect' (default: 'abort')
          skippable: true # permits bypass via --skip-checks
          config:
            severity: high
    - step: implementing
      checks:
        - id: '@qa.extended-lint'
          disabled: true # declaratively disables check on this step (requires allowDisable != false)
  ```
- **Declarative Disablement (`disabled: true`) vs Runtime Bypass (`skippable` / `--skip-checks`)**:
  - **Declarative Disablement (`disabled: true`)**: Configured at design time in `schema.yaml`. When set on a step's check declaration, the check is completely omitted from matching predicate execution for that coordinate. It generates zero user warnings, requires no `--skip-checks` runtime flag, and is only permitted if neither the check nor any matching existing binding enforces `allowDisable: false`.
  - **Runtime Bypass (`skippable` / `--skip-checks`)**: An operational, human-in-the-loop exception performed via CLI (`--skip-checks <id>`). Permitted only when `skippable === true`. The orchestrator records an explicit audit verdict (`bypassedByUser: true`).
- **Two-Tier Governance & Configuration Hierarchy (Check-Level vs Binding-Level)**:
  - **Delegated to Schema (Default)**: When a check is registered without `defaultBindings` (`defaultBindings?: undefined`), the check is an unbound catalog capability. Its lifecycle position (workflow step), direction (`along`), failure policy (`onFailure: 'abort' | 'collect'`), skippability (`skippable`), disablement (`disabled`), and execution `config` are entirely delegated to declarations in `schema.yaml`.
  - **Binding Coordinate Identity**: A binding is uniquely identified by its coordinate `{ checkId, scope: 'transition', to, along }` (or `{ checkId, scope: 'archive' }`). It is impossible to have duplicate bindings with the same coordinate for the same check. Duplicate definitions fail validation with `DuplicateCheckBindingError`.
  - **Global vs Step-Specific Binding Governance**:
    - **Global Check-Level Lock (`PluginCheckRegistration.allowBindingOverride: false`)**: Confinement lock. The check CANNOT be embedded into any other workflow steps in `schema.yaml` beyond its declared kernel bindings. If `schema.yaml` declares this check in any unauthorized step, validation fails with `CheckEmbeddingForbiddenError`.
    - **Step-Specific Binding Lock (`CheckBindingSpec.allowBindingOverride: false`)**: Policy lock on a specific coordinate. It only prevents `schema.yaml` from altering `onFailure` or `skippable` on that exact coordinate (`CheckBindingOverrideForbiddenError`). It does NOT prevent the check from being placed in other steps (which is strictly governed by the global lock).
    - **Global vs Step-Specific Disablement Lock (`allowDisable`)**: If set to `false` at the check level or on a matching binding, declaring `disabled: true` in `schema.yaml` throws `CheckDisableForbiddenError`. Core protocol invariants are permanently protected with `allowDisable: false`.
  - **Check-Level vs Step-Specific Configuration Governance**:
    - Check registration may declare `defaultConfig` that applies across all bindings as a common baseline.
    - An individual binding in `defaultBindings` may specify step-specific `config` that specializes the check-level baseline.
    - If `allowConfigOverride === false` (at check or binding level), `schema.yaml` cannot provide or override config on that coordinate (`CheckConfigOverrideForbiddenError`).
    - If `allowConfigOverride === true`, `schema.yaml` can provide step-specific config, resolved via cascaded merge: `{ ...check.defaultConfig, ...binding.config, ...schema.stepConfig }`.
  - **Monotonic Governance Rule Across Mergers and Redeclarations**:
    - All governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) operate strictly under monotonic restriction: once set to `false`, no schema redeclaration, layer merger (`merge-schema-layers`), or configuration extension can relax, delete, or wipe out the lock.
    - `merge-schema-layers` safely aggregates `step.checks` arrays using identity collision validation (`addToArray`), ensuring check declarations across schema layers cannot accidentally clobber or erase existing governance locks.
- Semantic validation in `buildSchema`:
  - Verifies canonical `id` format and registry existence (`UnknownCheckError`).
  - Evaluates check embedding purely through `governance.allowBindingOverride` rather than hardcoded string prefix inspection (`startsWith('@')`). This permits Category C built-in checks to be declared in `step.checks: []`, while strictly rejecting Category A protocol invariants.
  - Rejects duplicate check declarations on the same coordinate (`DuplicateCheckBindingError`).
  - Asserts that checks with global `allowBindingOverride: false` are not embedded in unauthorized steps (`CheckEmbeddingForbiddenError`).
  - Asserts that pinned step bindings do not have their policy modified (`CheckBindingOverrideForbiddenError` when binding `allowBindingOverride === false`).
  - Asserts that locked config is not overridden (`CheckConfigOverrideForbiddenError` when `allowConfigOverride === false`).
  - Asserts that locked checks or bindings are not disabled (`CheckDisableForbiddenError` when `allowDisable === false` and `disabled: true`).
  - Asserts that existing binding governance locks cannot be relaxed or overwritten by schema redeclarations.
  - Verifies `along` compatibility per step.
- Runtime composition & Cascaded Config Injection: At transition and status evaluation time, the orchestrator combines built-in bindings, fixed kernel-registered bindings, and validated schema-declared bindings (filtering out any step checks marked `disabled: true`). The orchestrator computes effective `config` via cascaded merge and attaches it to `CheckExecutionContext.config` before invoking `check.execute(ctx)`. If a schema references an unregistered check ID, it fails closed with `UnknownCheckError`.

### 5. Resilient Hook Failure Policies (`HookEntry.onFailure`)

- Extend `HookEntry` for `run:` and `external:` hook variants:

  ```typescript
  export type HookFailurePolicy = 'abort' | 'warn'

  export interface RunHookEntry {
    readonly id: string
    readonly type: 'run'
    readonly command: string
    readonly onFailure?: HookFailurePolicy // default: 'abort'
  }
  ```

- In `RunStepHooks.execute`:
  - When a hook process returns a non-zero exit code:
    - If `onFailure === 'abort'` (default): Abort the phase immediately with `success: false` (fail-fast).
    - If `onFailure === 'warn'`: Capture real stdout, stderr, and exitCode into a `warnings` collection, emit progress events indicating a non-blocking failure, and continue executing remaining hooks without breaking.
- In `RunStepHooksResult`:
  ```typescript
  export interface RunStepHooksResult {
    readonly hooks: readonly RunStepHookEntry[]
    readonly failedHooks: readonly RunStepHookEntry[]
    readonly warnings: readonly RunStepHookEntry[]
    readonly success: boolean // true if all failed hooks had onFailure: 'warn'
  }
  ```
- In `HookEffectCheck`: Check succeeds (`outcome: 'pass'`) if `result.success` is true, allowing the state transition to proceed while preserving full execution telemetry.

### 6. Uniform CLI Interface and Repair Guide

- Standardized transition bypass flag:
  ```bash
  specd changes transition <name> <step> --skip-checks <id1,id2>
  ```
- **Unified Use-Case Inputs & Backward-Compatible CLI Aliases**:
  - `TransitionChangeInput` and `ArchiveChangeInput` drop legacy booleans (`allowOutOfScope`, `allowOverlap`) in favor of a single `skipChecks?: readonly string[]` array.
  - The CLI adapter translates legacy flags: `--allow-out-of-scope` appends `impl.linksInScope` to `skipChecks`, and `--allow-overlap` appends `spec.overlap` to `skipChecks` (retaining concurrent change invalidation).
- **Retirement of Hardcoded Check Comparisons in `GetStatus`**:
  - `GetStatus._mergeBlockers` currently hardcodes check-specific branches (`linksInScopeSkippable`). This is eliminated.
  - `GetStatus` now looks up the check ID in `this._transitionBindings` and `this._archiveBindings`. If the binding exposes `skippable: true`, `GetStatus` dynamically projects `bypassFlag: '--skip-checks ' + check.id` for **any** check (built-in or plugin). Remediation commands (`check.command`) are also projected into `nextAction`.
- **Purging Check-Specific Booleans from `CheckExecutionContext`**:
  - Ad-hoc fields like `allowOutOfScope` and `allowOverlap` are removed from `CheckExecutionContext`. Pure check functions evaluate strictly whether the domain invariant holds, without needing ad-hoc boolean bypass parameters.
  - Bypass is handled uniformly by the orchestrator: when a check ID is in `skipChecks`, the orchestrator asserts `skippable: true` and generates a synthetic `{ outcome: 'skip', details: { bypassedByUser: true } }`.
- **Strict Bypass Enforcement (`skip-checks` vs `skip-hooks`)**:
  - The orchestrator validates bypass requests. If a user attempts to bypass a mandatory check (`skippable: false`), it throws `CheckNotSkippableError`.
  - **Boundary Guardrail**: `--skip-checks` is strictly for predicates. If a user attempts to bypass an effect check (e.g. `--skip-checks hook.pre`), the orchestrator rejects it with `CheckNotSkippableError` or `InvalidBypassTargetError`. Effects must be bypassed via `--skip-hooks`.
- **Error Abstraction Deduplication (`CheckPredicateFailedError`)**:
  - `TransitionChange._mapFailedPredicate` currently maps static checks to duplicated error classes (`ArchiveImplementationStateError`, etc.).
  - **Deduplication**: All bespoke predicate error classes are deleted. Every check failure (built-in or custom) throws a unified `CheckPredicateFailedError` containing `checkId`, `label`, `code`, `message`, `command`, and `details`.
  - The CLI Repair Guide catches this single error type and uniformly renders:

  ```text
  error: Security vulnerabilities detected with severity >= high
  ! SECURITY_VULNERABILITY — Validating security annotations: Found 2 high-severity issues

  repair guide:
    state:     implementing
    target:    verifying
    command:   pnpm audit:fix
    bypass:    Retry with --skip-checks @security.code-scan if an exception is granted
  ```

#### Three-Tier Governance & Audit Matrix for Existing (Built-in) Checks

All 15 built-in checks in `@specd/core` are audited and classified into three distinct architectural categories with explicit governance permissions (`allowBindingOverride`, `allowDisable`, `skippable`):

- **Category A: Protocol & State Invariants (Strictly Locked)**: Non-negotiable core invariants. Cannot be bound to arbitrary steps (`allowBindingOverride: false`), cannot be disabled in schema (`allowDisable: false`), and cannot be skipped via `--skip-checks` (`skippable: false`).
- **Category B: Native Step Attributes (Schema-Driven)**: Governed natively by dedicated step attributes (`step.requires: []`, `requiresTaskCompletion: true`, `approvals`). No need to redeclare in `step.checks: []`.
- **Category C: Policy & Consistency Checks (Declarable in Schema)**: Domain safety and consistency checks that project schemas can declare on workflow steps (`allowBindingOverride: true`), configure, or declaratively disable (`allowDisable: true`) when permitted.

| Check ID                  | Kind      | Category            | `allowBindingOverride` | `allowDisable` | `skippable` | Rationale & Governance Behavior                                                                                                                                                                                |
| :------------------------ | :-------- | :------------------ | :--------------------: | :------------: | :---------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol.edge`           | Predicate | **A** (Protocol)    |        `false`         |    `false`     |   `false`   | Validates that state transition follows `VALID_TRANSITIONS` edges. Mandatory protocol invariant. Embedding or disabling is strictly forbidden (`CheckEmbeddingForbiddenError` / `CheckDisableForbiddenError`). |
| `archive.archivable`      | Predicate | **A** (Protocol)    |        `false`         |    `false`     |   `false`   | State invariant for archive operation. Change must be in archivable state. Mandatory.                                                                                                                          |
| `schema.nameMatch`        | Predicate | **A** (Protocol)    |        `false`         |    `false`     |   `false`   | Schema parity invariant for archive operation. Mandatory.                                                                                                                                                      |
| `verification.current`    | Predicate | **A** (Evidence)    |        `false`         |    `false`     |   `false`   | Freshness invariant. Tests/verifications must be current before leaving `verifying` or archiving. Mandatory.                                                                                                   |
| `hook.pre`                | Effect    | **A** (Lifecycle)   |        `false`         |    `false`     |     N/A     | Lifecycle hook effect. Declared via `hooks.pre: []`, not `checks: []`. Bypassed via `--skip-hooks`, never `--skip-checks`.                                                                                     |
| `hook.post`               | Effect    | **A** (Lifecycle)   |        `false`         |    `false`     |     N/A     | Lifecycle hook effect. Declared via `hooks.post: []`, not `checks: []`. Bypassed via `--skip-hooks`.                                                                                                           |
| `workflow.requires`       | Predicate | **B** (Native)      |        `false`         |     Native     |   `false`   | Verifies existence of required artifacts. Governed natively via `step.requires: []`. Empty array indicates no requirements without needing `disabled: true`.                                                   |
| `workflow.taskCompletion` | Predicate | **B** (Native)      |        `false`         |     Native     |   `false`   | Checklist task completion. Governed natively via `step.requiresTaskCompletion: true/false`.                                                                                                                    |
| `approval.spec`           | Predicate | **B** (Native)      |        `false`         |     Native     |   `false`   | Spec signoff gate. Governed via workspace/schema `approvals.spec: on/off`. Self-discards cleanly if disabled.                                                                                                  |
| `approval.signoff`        | Predicate | **B** (Native)      |        `false`         |     Native     |   `false`   | Final signoff gate before archive. Governed via `approvals.signoff: on/off`.                                                                                                                                   |
| `impl.linksInScope`       | Predicate | **C** (Policy)      |         `true`         |     `true`     | **`true`**  | Scope boundary gate. Bypassed via `--skip-checks impl.linksInScope` (or legacy `--allow-out-of-scope`). Can be declaratively placed or disabled (`disabled: true`) in open monorepos.                          |
| `spec.overlap`            | Predicate | **C** (Policy)      |         `true`         |     `true`     | **`true`**  | Concurrent change conflict gate on archive. Bypassed via `--skip-checks spec.overlap` (or legacy `--allow-overlap`). Can be declaratively disabled if concurrent overlap is handled externally.                |
| `deps.consistent`         | Predicate | **C** (Policy)      |         `true`         |     `true`     |   `false`   | Spec dependency acyclicity. Can be bound to additional steps or disabled if project does not use strict spec deps. Non-skippable in CLI.                                                                       |
| `impl.filesResolved`      | Predicate | **C** (Consistency) |         `true`         |     `true`     |   `false`   | File completeness. Verifies touched implementation files resolve on disk. Can be bound or disabled for documentation-only workflows. Non-skippable in CLI.                                                     |
| `workspace.readOnly`      | Predicate | **C** (Environment) |         `true`         |     `true`     |   `false`   | Filesystem safety check. Verifies workspace is not read-only. Can be bound to custom steps or disabled in read-only sandbox workflows. Non-skippable in CLI.                                                   |

##### Concrete Code Modifications for Existing Built-in Checks:

1. **`impl-links-in-scope.ts`**:
   - `ImplLinksInScopeFacts`: Remove `readonly allowOutOfScope: boolean`.
   - `runImplLinksInScope(facts)`: Remove bypass branch (`if (facts.allowOutOfScope)`). Check logic evaluates purely whether `!facts.linksInScopeBlocked`.
2. **`spec-overlap.ts`**:
   - `SpecOverlapFacts`: Remove `readonly allowOverlap: boolean`.
   - `runSpecOverlap(facts)`: Remove bypass branch (`if (facts.allowOverlap)`). Check logic evaluates purely whether `!facts.specOverlapBlocked`.
3. **`check-bindings.ts`**:
   - Annotate `impl.linksInScope` and `spec.overlap` with `skippable: true` in `TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`.
   - Annotate Category A checks with `allowDisable: false` and `allowBindingOverride: false`.
   - Annotate Category C checks with `allowDisable: true` and `allowBindingOverride: true`.
4. **`transition-checks.ts`**:
   - Add `readonly skippable?: boolean` and `readonly allowDisable?: boolean` to `CheckBindingSpec` and `CheckBinding`.
   - Keep `Check` pure without `skippable`.
   - Purge `allowOutOfScope` and `allowOverlap` from `CheckExecutionContext`.
5. **`build-schema.ts`**:
   - Remove rigid `chk.id.startsWith('@')` guard. Rely strictly on `governance.allowBindingOverride` and `governance.allowDisable` to accept Category C built-in checks and reject Category A protocol invariants with typed errors.

### 7. Architectural Distinction: Checks vs Hooks

| Dimension                  | Checks (`Check`)                                                                                                                       | Hooks (`HookEntry`)                                                                                                                         |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**                | **State Invariant (Gatekeeper)**: Answers _"Does the change satisfy the preconditions for this state?"_                                | **Operational Side-Effect (Action)**: Answers _"What external processes should run upon entering/leaving this state?"_                      |
| **Execution Context**      | In-memory TypeScript code inside the SpecD kernel; direct access to `CheckExecutionContext` (change aggregate, schema, DAG, validity). | External shell processes (`run:`) or containers (`external:`) launched via OS subprocessing.                                                |
| **Status Projection**      | **Always evaluated in `specd changes status`**. Visible in the DAG, reports blockers, and computes `nextAction`.                       | **Never evaluated in `status`**. Only runs during explicit `transition` or standalone `run-hooks`.                                          |
| **Idempotence & Timing**   | Pure and deterministic. Can be re-evaluated repeatedly without filesystem mutations.                                                   | May be non-idempotent (file generation, notifications, remote deployments). Can be deferred by agents using `run-hooks` and `--skip-hooks`. |
| **Failure Representation** | Structured `CheckResult` (`outcome`, `code`, `message`, `command`, `details`).                                                         | Process execution result (`exitCode`, `stdout`, `stderr`, streaming lines, heartbeats).                                                     |

**Note on Internal Engine Modeling (`hook.pre` / `hook.post`)**:
While custom plugins are strictly prevented from registering effects (the registry strictly enforces `kind: 'predicate'`), the internal specd engine elegantly models `hook.pre` and `hook.post` as `Check` objects with `kind: 'effect'`. This internal abstraction allows hooks to participate seamlessly in the same execution graph (`executeChecksByLegalTargets`) and bindings table (`TRANSITION_BINDING_SPECS`). However, they are fundamentally side-effects, meaning they are excluded from `GetStatus` evaluations, and bypassed via `--skip-hooks`, never `--skip-checks`.

### 8. Integrator & Developer Documentation

To ensure this new extension capability is usable by third-party plugin authors, we will update the integrator documentation in `@specd/core`:

- **New Integrator Guide (`docs/core/custom-checks.md`)**: A complete developer reference for integrators explaining the difference between checks (predicates) and hooks (effects), the `CustomCheckDefinition` API, the isolated `ctx.config` cascade, how to author a custom check (with examples), and how to register it via the Kernel Builder.

In addition, we will update the user and agent-facing guides:

- **User/Agent Guides (`docs/guide/`)**:
  - `workflow.md` & `configuration.md`: Update to document the new `onFailure: warn | abort` hook policy and how users can configure it for resilient tasks.
  - `cli.md`: Update the troubleshooting / repair guide sections to cover the new `--skip-checks` universal bypass flag and the unified `CheckPredicateFailedError` output format.

## Specs affected

### New specs

- `core:check-registry`: Open transition check registry contract, canonical `@pluginName.id` namespacing, built-in immutability, adapting public `CustomCheckDefinition` to internal `Check` with `kind: 'predicate'`, runtime assertion rejecting effect checks with `InvalidCheckKindError`, and registration lifecycle.
  - Depends on: `core:transition-checks`, `default:_global/architecture`

### Modified specs

- `core:transition-checks`: Open check identifiers from closed union to dynamic strings, enrich `CheckResult` with remediation command, define public `CustomCheckDefinition` without engine-internal kind, establish explicit `skippable` permissions for all built-in checks, purge ad-hoc bypass flags (`allowOutOfScope`, `allowOverlap`) from `CheckExecutionContext`, and support dynamic check lookup.
  - Depends on (added): `core:check-registry`
  - Depends on (removed): none
- `core:transition-change`: Support dynamic schema-declared checks, accept `skipChecks` in use case input, enforce `skippable` permissions by rejecting unauthorized bypass attempts with `CheckNotSkippableError`, eliminate hardcoded check branches in status blockers, and map custom check failures to typed diagnostic errors.
  - Depends on (added): none
  - Depends on (removed): none
- `core:workflow-model`: Extend workflow step schema model to declare custom check bindings (`checks[]`).
  - Depends on (added): none
  - Depends on (removed): none
- `core:hook-execution-model`: Introduce `onFailure: 'abort' | 'warn'` failure policies for shell and external hooks, capturing real diagnostics without halting transitions on non-critical hooks.
  - Depends on (added): none
  - Depends on (removed): none
- `core:build-schema`: Validate schema-declared `checks[]` syntax, step applicability, and hook `onFailure` attributes; validate against unauthorized step embedding (`CheckEmbeddingForbiddenError`), locked step bindings (`CheckBindingOverrideForbiddenError`), or locked config (`CheckConfigOverrideForbiddenError`).
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel`: Extend `KernelOptions` / `CompositionRegistryInput` and `KernelBuilder` to accept custom check registrations (`PluginCheckRegistration` with `CustomCheckDefinition`), wire the unified `CheckRegistry` with built-in and plugin checks, and expose registered checks through kernel composition views.
  - Depends on (added): `core:check-registry`
  - Depends on (removed): none
- `cli:change-transition`: Add `--skip-checks <ids>` option, delegate check bypass to use case, and format custom check repair guides.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-loader`: Standardize layer merge semantics on the shared domain `deepMergeConfig` helper to support deep recursive merging of arbitrary nested records of records across configuration cascade layers.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Core Domain Layer** (`packages/core`):
  - `deep-merge-config.ts`: Pure domain service helper `deepMergeConfig` for recursive deep merging of records and cascading check/layer configs without destructively obliterating untouched child keys.
  - `transition-checks.ts`: Replace closed `CheckId` union with `string`; enrich `CheckResult` with `command?: string`; introduce `CustomCheckDefinition` public interface; add `skippable?: boolean` to `CheckBindingSpec` and `CheckBinding`; purge `allowOutOfScope` and `allowOverlap` from `CheckExecutionContext`.
  - `impl-links-in-scope.ts`: Remove `allowOutOfScope` from `ImplLinksInScopeFacts`; eliminate bypass branch so check evaluates purely whether links are in-scope.
  - `spec-overlap.ts`: Remove `allowOverlap` from `SpecOverlapFacts`; eliminate bypass branch so check evaluates purely whether specs overlap.
  - `check-bindings.ts`: Declare `skippable: true` for `impl.linksInScope` and `spec.overlap` in `TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`; all other built-in predicate bindings default to `skippable: false`.
  - `check-registry.ts`: New registry entity enforcing `@pluginName.id` namespacing, adapting `CustomCheckDefinition` to internal `Check`, asserting `kind: 'predicate'` (`InvalidCheckKindError`), and managing built-in versus plugin checks.
  - `workflow-step.ts`: Extend `HookEntry` with `onFailure?: 'abort' | 'warn'`; extend `WorkflowStep` with `checks?: readonly WorkflowStepCheckDeclaration[]`.
  - `build-schema.ts`: Validate syntax and schema constraints for declared checks and hook failure policies.
- **Core Application Layer** (`packages/core`):
  - `config-schema.ts`: Delegate `deepMergeRawConfig` to `deepMergeConfig` with cascade-specific ignored keys (`extends`, `remove`).
  - `TransitionChange`: Accept `skipChecks` input set, evaluate dynamic bindings, resolve cascaded check configs via `deepMergeConfig`, throw `CheckPredicateFailedError`.
  - `GetStatus`: Project custom checks into `lifecycle.blockers` and incorporate check remediation commands into `nextAction`.
  - `RunStepHooks`: Implement `warn` non-blocking hook failures with warnings aggregation.
  - `ListWorkflowChecks`: Provide query capability for active and registered checks.
- **SDK & Composition Layer** (`packages/sdk`, `packages/core`):
  - `CompositionRegistryInput` & `KernelOptions`: Accept `checks?: readonly PluginCheckRegistration[]`.
  - `kernel-builder.ts`: Add `registerCheck(pluginName, check: CustomCheckDefinition, defaultBindings?, options?)` to fluent builder.
- **CLI Adapter Layer** (`packages/cli`):
  - `transition.ts`: Register `--skip-checks <ids>`, map to use case input, and format `CheckPredicateFailedError` in `writeTextRepairGuide`.
  - `run-hooks.ts`: Render warnings for non-blocking failed hooks.
- **Documentation & Guides** (`packages/guide`, `docs/`):
  - `@specd/core`: A new integrator guide `docs/core/custom-checks.md` will be required.
  - `@specd/guide`: `schemas.md` (to document the new `checks` and `onFailure` schema syntax), `workflow.md`, `configuration.md`, and `cli.md` in `docs/guide/` will require updates to reflect the user-facing bypass flags and resilient hook policies.
  - `docs/adr/`: Add `0030-open-check-registry-and-hook-failure-policies.md`.

## Technical context

- **Separation of Concerns**: Checks are pure, in-memory state queries evaluated during `status` and `transition` before any mutations. Hooks are asynchronous side-effects executed only during state transitions. Under no circumstance can a custom check be registered as an `effect`; side effects belong exclusively to Hooks.
- **Namespacing & Sandboxing**: To prevent third-party plugins from overriding critical core invariants (`protocol.edge`, `workflow.requires`), custom checks must be registered with `pluginName` producing `@${pluginName}.${check.id}`. Built-in checks are injected at registry creation and cannot be registered via the public `register` API.
- **CLI Stability**: Rather than allowing plugins to register arbitrary flags in Commander (which creates conflicts and parser instability), the CLI provides a single `--skip-checks <ids>` mechanism. The check defines whether it is skippable via `skippable: true`.
- **Failure Transparency**: Replacing `|| true` with `onFailure: warn` preserves true process exit codes, stdout, and stderr for debugging and AI agent visibility while preventing unwanted pipeline abortion.

## Open questions

None. All architectural decisions (check namespacing, registry construction, failure policies, and CLI interface) have been aligned.

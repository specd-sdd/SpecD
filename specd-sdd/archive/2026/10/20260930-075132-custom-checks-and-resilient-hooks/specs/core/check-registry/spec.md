# Check Registry

## Purpose

The Check Registry provides a centralized, extensible registry in `@specd/core` for lifecycle transition checks. It decouples lifecycle transition evaluations from closed enumerations, allowing third-party plugins and workflow schemas to define, register, and bind custom predicate checks while guaranteeing the immutability of core protocol invariants, strict canonical namespacing, and two-tier governance over schema embedding and configuration.

## Requirements

### Requirement: Open check registry

The system SHALL provide a domain service `CheckRegistry` in `@specd/core` responsible for cataloging, resolving, and querying lifecycle transition checks.
The registry MUST maintain:

- An internal catalog of registered `Check` entities indexed by their canonical identifier.
- An internal collection of default `CheckBinding` objects associating checks with specific lifecycle transition and archive coordinates.

The registry interface MUST expose methods to:

- Retrieve a check by its canonical identifier (`get(canonicalId: string): Check | undefined`).
- Check whether a canonical check identifier is registered (`has(canonicalId: string): boolean`).
- List all registered check definitions (`list(): readonly Check[]`).
- Query all active default check bindings (`bindings(): readonly CheckBinding[]`).

### Requirement: Immutability of built-in checks

All built-in system checks (`protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, `deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `impl.linksInScope`, `approval.spec`, `approval.signoff`, `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `verification.current`, `hook.pre`, `hook.post`) MUST be injected into the `CheckRegistry` upon constructor initialization.
The public `CheckRegistry` interface MUST NOT expose any method to register, replace, mutate, or unregister built-in checks.
The registry MUST prevent any external plugin from registering a check with an unprefixed identifier matching a built-in check ID.

### Requirement: Canonical namespacing and plugin registration

External plugins MUST register custom checks through the public `register()` method:

```typescript
register(
  pluginName: string,
  check: CustomCheckDefinition,
  defaultBindings?: readonly CheckBindingSpec[],
  options?: PluginCheckRegistration,
): string
```

The `pluginName` argument MUST be a non-empty string conforming strictly to `^[a-zA-Z0-9_-]+$`. If `pluginName` contains invalid characters (such as `@` or `.`) or is empty, the registry MUST throw an `InvalidPluginNameError`.
The registry MUST automatically construct the canonical check identifier as `@${pluginName}.${check.id}`.
If a check with the resulting canonical identifier is already registered, the registry MUST throw a `DuplicateCheckError`.

### Requirement: Adaptation of CustomCheckDefinition to internal Check

The public registration interface MUST accept a `CustomCheckDefinition`, which deliberately omits the engine-internal `kind` property to provide clean developer ergonomics.
The registry MUST adapt the `CustomCheckDefinition` into an internal `Check` entity, automatically setting `kind: 'predicate'`.
If an untyped JavaScript caller provides an object containing an explicit `kind` property whose value is not `'predicate'`, the registry MUST reject the registration and throw an `InvalidCheckKindError`.
Custom checks MUST strictly evaluate state invariants (predicates). Registration of external commands, subprocess executions, or filesystem mutations as checks SHALL NOT be permitted.

### Requirement: Binding coordinate identity and duplicate prevention

Each check binding MUST be uniquely identified by its lifecycle coordinate:

- For transition bindings: `{ checkId, scope: 'transition', to, along }` where `to` is the target `ChangeState` and `along` is the classified transition direction.
- For archive bindings: `{ checkId, scope: 'archive' }`.

The registry MUST reject registration attempts containing duplicate bindings for the exact same coordinate with a `DuplicateCheckBindingError`.

### Requirement: Two-tier governance and confinement locks

The registry MUST support a two-tier governance model distinguishing check-level constraints from binding-level constraints:

1. **Check-Level Confinement (`allowBindingOverride`)**:
   - `PluginCheckRegistration.allowBindingOverride`: If explicitly set to `false`, the check is locked to its declared `defaultBindings`. It CANNOT be embedded into any workflow step in `schema.yaml` beyond those declared bindings.
   - If `defaultBindings` are provided and `allowBindingOverride` is not specified, it SHALL default to `false`.
   - If `defaultBindings` are omitted, the check is registered as an unbound catalog capability and `allowBindingOverride` SHALL default to `true`.
2. **Binding-Level Policy Lock (`allowBindingOverride`)**:
   - `CheckBindingSpec.allowBindingOverride`: If set to `false` on a specific binding coordinate, `schema.yaml` CANNOT alter the `onFailure` policy or `skippable` permission for that exact coordinate. This flag SHALL NOT restrict binding the check to other steps if the check-level confinement allows it.
3. **Configuration Override Locks (`allowConfigOverride`)**:
   - If set to `false` at the check level, schemas CANNOT provide or override configuration for this check anywhere.
   - If set to `false` at a specific binding level, schemas CANNOT override configuration for that specific coordinate.
4. **Disablement Governance Locks (`allowDisable`)**:
   - `PluginCheckRegistration.allowDisable`: If set to `false`, the check CANNOT be disabled in `schema.yaml` via `disabled: true`. Core protocol invariants MUST have `allowDisable: false`.
   - `CheckBindingSpec.allowDisable`: If set to `false` on a specific binding coordinate, `schema.yaml` CANNOT disable the check for that specific coordinate.
   - **Immutability of `allowDisable` (No Relaxation)**: An existing binding or check definition with `allowDisable: false` CANNOT be relaxed or overridden by `schema.yaml`. Any attempt in `schema.yaml` to declare `disabled: true` on a check or coordinate where `allowDisable: false` is active MUST throw a `CheckDisableForbiddenError`.
5. **Monotonic Governance Rule (Principle of Monotonic Governance Locks)**:
   - All governance locks (`allowBindingOverride`, `allowConfigOverride`, `allowDisable`) operate strictly under monotonic restriction: once set to `false` by a check or prior binding, they CANNOT be erased, relaxed, or overwritten by subsequent schema layers, redeclarations of the same binding, or AST mergers (`merge-schema-layers`).
   - Schema layer mergers (`merge-schema-layers`) MUST preserve `step.checks` collections using collision-safe array mutation, preventing accidental clobbering or erasure of governance locks across extended layers.
   - Any attempt to downgrade or erase a lock (`false` -> `true` or omitted) across layers or redeclarations MUST be strictly rejected, guaranteeing the principle of least privilege.
6. **Built-in Checks Governance Categorization**:
   - The registry MUST initialize built-in checks according to their architectural category:
     - **Category A (Protocol & State Invariants)** (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`): MUST have `allowBindingOverride: false` and `allowDisable: false`.
     - **Category B (Native Step Attributes)** (`workflow.requires`, `workflow.taskCompletion`, `approval.spec`, `approval.signoff`): Governed natively via dedicated step and workspace schema configurations (`requires: []`, `requiresTaskCompletion`, `approvals`). MUST have `allowBindingOverride: false` and `allowDisable: false` in the check registry to prevent redundant or conflicting embedding in `step.checks: []`.
     - **Category C (Policy & Consistency Checks)** (`impl.linksInScope`, `spec.overlap`, `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`): MUST have `allowBindingOverride: true` and `allowDisable: true`, permitting project schemas to declare them on workflow steps or disable them.

### Requirement: Cascading configuration hierarchy

The registry MUST record check-level `defaultConfig` and binding-level `config`.
At runtime, the effective configuration for a check instance MUST be computed via cascaded merge in order of precedence:
`{ ...checkDefaultConfig, ...bindingDefaultConfig, ...schemaStepConfig }`.
The resolved configuration MUST be passed into `CheckExecutionContext.config` as an isolated, read-only record.

## Constraints

- Domain purity: The `CheckRegistry` is a pure domain service in `@specd/core` and MUST NOT perform filesystem I/O, subprocess execution, or console logging.
- Backward compatibility: Existing built-in check resolutions must continue to function with zero behavioral degradation.
- Immutability: Once constructed and registered, checks and bindings cannot be dynamically unregistered or mutated during a workflow execution.

## Spec Dependencies

- [`core:transition-checks`](../transition-checks/spec.md) — Base check interfaces, `Check`, `CheckResult`, `CheckExecutionContext`, and built-in check specifications.
- [`default:_global/architecture`](../../default/_global/architecture/spec.md) — Pure domain services and inversion of control.

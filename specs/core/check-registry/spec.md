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

All built-in system checks (`protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, `workflow.tasksEmpty`, `deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `impl.linksInScope`, `approval.spec`, `approval.signoff`, `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `verification.current`, `hook.pre`, `hook.post`) MUST be injected into the `CheckRegistry` upon constructor initialization.
The public `CheckRegistry` interface MUST NOT expose any method to register, replace, mutate, or unregister built-in checks.
External plugin checks are always registered under the `@<plugin>.<id>` namespace, so an external registration can never produce an unprefixed identifier and can never collide with or shadow a built-in check ID, even when `<plugin>` or `<id>` resemble built-in segments (for example `@protocol.edge` is distinct from `protocol.edge`). The registry SHALL throw `InvalidPluginNameError` only when the plugin name violates the documented plugin-name grammar `^[a-zA-Z0-9_-]+$` (for example empty, whitespace, symbols, dots, or path traversal).

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
- For archive bindings: `{ checkId, scope: 'archive' }`. A schema `archiveChecks` declaration targets this coordinate; at most one declaration per check id is allowed in one `archiveChecks` array.
- For step-skip bindings: `{ checkId, scope: 'step-skip', step }` where `step` is the intermediate `ChangeState` being bypassed.

The registry MUST reject registration attempts containing duplicate bindings for the exact same coordinate with a `DuplicateCheckBindingError`.

### Requirement: Two-tier governance and confinement locks

The registry MUST support a governance model that separates **where** a schema may place a check from **what** a schema may change on bindings defined by code. A binding is **code-defined** when it comes from the built-in binding tables or from a plugin's `defaultBindings`. A binding is **schema-owned** when a schema declaration creates it at a coordinate that no code-defined binding serves.

1. **Placement Lock (`allowSchemaEmbedding`, check level)**:
   - `PluginCheckRegistration.allowSchemaEmbedding` and the built-in check governance declare whether a schema MAY place the check at a coordinate that no code-defined binding of that check serves. When `false`, such a declaration MUST throw `CheckEmbeddingForbiddenError`.
   - For plugin checks, if `defaultBindings` are provided and `allowSchemaEmbedding` is not specified, it SHALL default to `false`. If `defaultBindings` are omitted, the check is an unbound catalog capability and `allowSchemaEmbedding` SHALL default to `true`.
   - Declaring a check (built-in or plugin) at a coordinate already served by one of its code-defined bindings is NOT embedding. It MUST be accepted regardless of `allowSchemaEmbedding`, and it is governed only by that coordinate's policy, configuration, and disablement locks.
   - `allowSchemaEmbedding` SHALL NOT lock `onFailure`, `skippable`, configuration, or disablement at any coordinate.
2. **Code-Defined Policy Lock (`allowBindingOverride`)**:
   - `CheckBindingSpec.allowBindingOverride`: if `false` on a code-defined binding coordinate, `schema.yaml` CANNOT alter the `onFailure` policy or the `skippable` permission for that exact coordinate (`CheckBindingOverrideForbiddenError`).
   - `PluginCheckRegistration.allowBindingOverride` is the default inherited by the plugin's default bindings that omit the field. If `defaultBindings` are provided and it is not specified, it SHALL default to `false`.
   - `allowBindingOverride` SHALL NOT restrict placement; placement is governed only by `allowSchemaEmbedding`.
   - `allowBindingOverride` SHALL NOT apply to schema-owned bindings.
3. **Configuration Override Locks (`allowConfigOverride`)**:
   - If set to `false` at the check level, schemas CANNOT provide or override configuration for this check anywhere, including schema-owned bindings.
   - If set to `false` on a code-defined binding, schemas CANNOT override configuration for that specific coordinate.
   - A code-defined binding that omits `allowConfigOverride` SHALL inherit the check-level value; it SHALL NOT default to a more permissive value than its check.
4. **Disablement Governance Locks (`allowDisable`)**:
   - `PluginCheckRegistration.allowDisable`: If set to `false`, the check CANNOT be disabled in `schema.yaml` via `disabled: true`, at any coordinate. Core protocol invariants MUST have `allowDisable: false`.
   - `CheckBindingSpec.allowDisable`: If set to `false` on a code-defined binding coordinate, `schema.yaml` CANNOT disable the check for that specific coordinate.
   - **Immutability of `allowDisable` (No Relaxation)**: An existing binding or check definition with `allowDisable: false` CANNOT be relaxed or overridden by `schema.yaml`. Any attempt in `schema.yaml` to declare `disabled: true` on a check or coordinate where `allowDisable: false` is active MUST throw a `CheckDisableForbiddenError`.
5. **Monotonic Governance Rule (Principle of Monotonic Governance Locks)**:
   - Every lock set by code (check registration or code-defined binding) operates under monotonic restriction: once `false`, it CANNOT be erased, relaxed, or overwritten by subsequent schema layers, redeclarations of the same binding, or AST mergers (`merge-schema-layers`).
   - Schema layer mergers (`merge-schema-layers`) MUST preserve the `step.checks`, `step.skipChecks`, and `step.archiveChecks` collections using collision-safe array mutation, preventing accidental clobbering or erasure of governance locks across extended layers.
   - Any attempt to downgrade or erase a code-set lock (`false` -> `true` or omitted) across layers or redeclarations MUST be strictly rejected, guaranteeing the principle of least privilege.
   - **Schema-owned bindings belong to the schema.** Because a schema-owned binding carries no code-defined binding locks, a later schema layer (`extends`, schema plugin, `schemaOverrides`) MAY change its `onFailure`, `skippable`, configuration, or `disabled` flag, or remove it, subject only to the check-level `allowConfigOverride` and `allowDisable` locks. Governance is validated against the merged declaration.
6. **Built-in Checks Governance Categorization**:
   - The registry MUST initialize built-in checks according to their architectural category:
     - **Category A (Protocol & State Invariants)** (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`): MUST have `allowSchemaEmbedding: false`, `allowBindingOverride: false`, and `allowDisable: false`.
     - **Category B (Native Step Attributes)** (`workflow.requires`, `workflow.taskCompletion`, `workflow.tasksEmpty`, `approval.spec`, `approval.signoff`): Governed natively via dedicated step and workspace schema configurations (`requires: []`, `requiresTaskCompletion`, `approvals`). MUST have `allowSchemaEmbedding: false`, `allowBindingOverride: false`, and `allowDisable: false` to prevent redundant or conflicting embedding in `step.checks: []`.
     - **Category C (Policy & Consistency Checks)** (`impl.linksInScope`, `spec.overlap`, `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`): MUST have `allowSchemaEmbedding: true`, `allowBindingOverride: true`, and `allowDisable: true`, permitting project schemas to declare them on workflow steps, configure them, or disable them.
     - **Archive exception**: on bindings with `scope: 'archive'` only, `workspace.readOnly`, `impl.filesResolved`, and `deps.consistent` MUST declare `allowBindingOverride: false`, `allowConfigOverride: false`, `allowDisable: false`, and `skippable: false`. `workspace.readOnly` is a security boundary and the other two are required for a valid archive, so no schema declaration and no `--skip-checks` may relax them there. Their check-level governance and their `transition` and `step-skip` bindings remain Category C. On archive, the only built-in checks a schema can configure, disable, or make skippable are `spec.overlap` and `impl.linksInScope`.
   - Every built-in binding spec MUST declare `allowBindingOverride` and `allowDisable` explicitly with its category's values (applying the archive exception above).
7. **Registration fidelity through composition**:
   - Kernel composition SHALL forward every governance field of a `PluginCheckRegistration` (`allowSchemaEmbedding`, `allowBindingOverride`, `allowConfigOverride`, `allowDisable`, `defaultConfig`) to the `CheckRegistry` unchanged.
   - Kernel composition SHALL forward every declared default binding of a plugin check, in all scopes (`transition`, `archive`, and `step-skip`), into the bindings the use cases evaluate. A plugin `step-skip` default binding SHALL be evaluated when its step is bypassed exactly like a built-in step-skip binding.
8. **Executable check instances**:
   - The `CheckRegistry` that composition hands to use cases MUST catalog the executable application check instances (the `create*` factories that read real facts through ports) for every built-in check.
   - Domain matcher instances that evaluate fixed facts SHALL be used only for matcher tests and domain fixtures. A binding synthesized for a schema-embedded check MUST evaluate the same real implementation as that check's code-defined bindings, never a stub that cannot fail.
9. **Archive declarations**:
   - Schema `archiveChecks` declarations on the `archiving` workflow entry are governed by the same locks as `checks` and `skipChecks`: placement (`allowSchemaEmbedding`), policy (`allowBindingOverride`, for `skippable` only because `archiveChecks` has no `onFailure`), configuration (`allowConfigOverride`), and disablement (`allowDisable`), evaluated against the code-defined `scope: 'archive'` binding of the check when one exists.
   - A declaration for a check that no code-defined archive binding serves is embedding and is governed by `allowSchemaEmbedding`. A plugin whose default bindings include `{ scope: 'archive' }` is therefore tunable by a schema at that coordinate without embedding.

### Requirement: Cascading configuration hierarchy

The registry MUST record check-level `defaultConfig` and binding-level `config`.
The effective configuration for a check at a coordinate MUST be computed exactly once, by the binding resolver (`resolveEffectiveBindings` in [`core:transition-checks`](../transition-checks/spec.md)), via a deep merge in order of precedence: check `defaultConfig`, then binding `config`, then the schema step declaration `config`. Objects merge by key, arrays concatenate in that order, and scalars from a later level replace earlier ones.
The predicate runner MUST pass the resolved configuration unchanged; it SHALL NOT merge configuration again.
The resolved configuration MUST be passed into `CheckExecutionContext.config` as an isolated, read-only record.

## Constraints

- Domain purity: The `CheckRegistry` is a pure domain service in `@specd/core` and MUST NOT perform filesystem I/O, subprocess execution, or console logging.
- Backward compatibility: Existing built-in check resolutions must continue to function with zero behavioral degradation.
- Immutability: Once constructed and registered, checks and bindings cannot be dynamically unregistered or mutated during a workflow execution.

## Spec Dependencies

- [`core:transition-checks`](../transition-checks/spec.md) — Base check interfaces, `Check`, `CheckResult`, `CheckExecutionContext`, and built-in check specifications.
- [`default:_global/architecture`](../../_global/architecture/spec.md) — Pure domain services and inversion of control.
- [`core:schema-format`](../schema-format/spec.md) — workflow row options (`checks`, `skipChecks`, `archiveChecks`) that the governance locks apply to

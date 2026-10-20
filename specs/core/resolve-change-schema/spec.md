# ResolveChangeSchema

## Purpose

Change-bound operations need one trustworthy boundary for loading the schema recorded by a change. `ResolveChangeSchema` prevents callers from falling back to the workspace default, centralizes provider identity validation, and reports compatible same-name version drift consistently.

## Requirements

### Requirement: Input and result contract

`ResolveChangeSchema.execute` MUST accept the recorded `schemaName` and `schemaVersion` of an active, drafted, discarded, or archived change.

On success it MUST return:

- `schema` — the resolved `Schema` entity whose canonical name matches the requested `schemaName`.
- `warnings` — zero or more typed advisory records. A same-name version difference MUST be represented as an advisory containing the recorded and resolved versions.

The use case MUST NOT require or consult the workspace default schema reference.

### Requirement: Sovereign named lookup

The use case MUST call `SchemaProvider.get(schemaName)` with the schema name recorded by the change. It MUST NOT call the provider without a name, retry with the workspace default, or substitute a different configured schema when lookup fails.

A workspace default whose name or version differs from the recorded reference is valid and irrelevant to this resolution.

The composed `SchemaProvider` MUST resolve a named lookup independently of the workspace default: `get(name)` for a name other than the default MUST NOT first resolve, validate, or cache the default schema, so a missing or invalid workspace default cannot prevent resolving an existing change's recorded schema.

### Requirement: Provider identity integrity

After lookup, the use case MUST compare the returned schema's canonical name with the requested `schemaName`.

If the names differ, it MUST throw `SchemaProviderIdentityMismatchError` before returning or using the schema. The error MUST identify both the requested and returned canonical names and comply with the shared SpecD error contract.

`SchemaProviderIdentityMismatchError` is distinct from errors describing schema content, validation, or compatibility failures.

### Requirement: Same-name version advisory

When the returned canonical name matches the requested `schemaName` but its version differs from the recorded `schemaVersion`, the use case MUST return the resolved schema and emit a non-blocking advisory.

The advisory MUST be derived from the recorded reference and the schema returned by the named lookup. It MUST NOT compare against the workspace default. Callers MUST remain able to continue the change lifecycle with the resolved same-name schema.

### Requirement: Failure propagation and caller policy

Lookup and provider failures other than a canonical-name mismatch MUST propagate unchanged unless the calling use case explicitly defines a read-only degradation policy.

Mutating use cases MUST stop before schema-derived evaluation, effects, hooks, mutation, or persistence when resolution fails.

Read-only status MAY convert failures into public blockers, but it MUST preserve the distinction between general resolution failure and provider identity mismatch and MUST NOT project topology, actions, or artifact rules from an untrusted schema.

### Requirement: Shared change-operation boundary

All operations whose behavior depends on an existing change's schema MUST obtain it through `ResolveChangeSchema` or an equivalent dependency resolved from the same canonical composition boundary. Callers MUST NOT duplicate named lookup, identity validation, version comparison, or default-schema fallback policy.

The shared boundary applies to active-change lifecycle operations, artifact and context operations, approval and verification operations, validity fingerprints, validity reconciliation, archive operations (including post-archive spec metadata materialization for the archived change's specs, which passes the resolved schema name to `MaterializeSpecMetadata`), read-only status projections, change-repository artifact-type synchronization on load and save, and CLI commands that render or address a change's artifact DAG (`changes status`, `changes validate`, `changes spec-preview`, `changes artifacts`).

Callers that surface diagnostics SHALL propagate the returned `warnings` to their own result or presenter instead of only logging them. This includes the CLI commands listed above: `changes validate`, `changes spec-preview`, and `changes artifacts` SHALL render the advisories (text `warnings:` section, structured `schemaWarnings`) rather than discarding them.

### Requirement: Composition

The config-based factory MUST resolve `SchemaProvider` through the canonical composition resolver and delegate to the dependency-based constructor. The use case MUST depend only on application ports and domain values; it MUST perform no filesystem or configuration loading directly.

The use case SHALL expose canonical `createResolveChangeSchema(deps)` and convenience `createResolveChangeSchema(config, options?)` factories. The kernel SHALL mount the shared instance as `kernel.changes.resolveSchema` so that adapters (CLI commands rendering a change's artifact DAG) resolve the change schema through the same boundary instead of the workspace default.

## Constraints

- Canonical schema name equality is exact.
- A name mismatch is fatal even when versions happen to match.
- A same-name version mismatch is advisory, never an implicit migration or rebind.
- The workspace default cannot authorize, reject, or alter an existing change's schema resolution.
- The use case does not mutate the change or persist warnings itself.

## Spec Dependencies

- [`core:change`](../../../../specs/core/change/spec.md) — recorded sovereign schema identity and version on change views.
- [`core:schema-format`](../../../../specs/core/schema-format/spec.md) — resolved Schema identity and version contract.
- [`default:_global/error-handling-conventions`](../../../../specs/_global/error-handling-conventions/spec.md) — typed public error requirements.

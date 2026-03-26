# Workspace

## Purpose

Projects often span multiple code repositories or teams, and specd needs a structured way to group specs, code locations, schemas, and ownership under a single named context so that cross-repo changes remain unambiguous. A workspace is this fundamental organizational unit: every spec belongs to exactly one workspace, every change targets one or more workspaces, and context compilation, archiving, and validation all resolve resources through workspace-qualified lookups. This spec defines workspace identity, properties, invariants, and interactions with the rest of the system.

## Requirements

### Requirement: Workspace identity

A workspace is identified by a unique name within a project's `specd.yaml`. Names must match `/^[a-z][a-z0-9-]*$/`. The name `default` is reserved for the local project workspace — every project must declare a `default` workspace. No two workspaces in the same configuration may share the same name.

### Requirement: Workspace properties

A workspace declares the following properties:

| Property              | Required           | Default (`default` ws) | Default (non-`default` ws)            | Description                                                            |
| --------------------- | ------------------ | ---------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `specs`               | always             | —                      | —                                     | Storage adapter and path where this workspace's spec files live        |
| `codeRoot`            | non-`default` only | project root           | (none — must be explicit)             | Directory where the implementation code for this workspace lives       |
| `schemas`             | no                 | `specd/schemas`        | (none — no local schemas)             | Storage adapter and path for named local schemas                       |
| `ownership`           | no                 | `owned`                | `readOnly`                            | The project's relationship to this workspace's specs                   |
| `prefix`              | no                 | (none)                 | (none)                                | Logical path prefix prepended to all capability paths                  |
| `contextIncludeSpecs` | no                 | —                      | `['*']` (all specs in this workspace) | Workspace-level include patterns applied when this workspace is active |
| `contextExcludeSpecs` | no                 | —                      | (none)                                | Workspace-level exclude patterns applied when this workspace is active |

All relative paths resolve from the directory containing `specd.yaml`.

### Requirement: External workspace inference

A workspace is considered external when its `specs` storage path resolves to a location outside the project's repository root. This property (`isExternal`) is inferred from the resolved path at configuration load time — it is never declared explicitly. External workspaces affect ownership defaults and change validation behavior.

### Requirement: Ownership semantics

Ownership describes the project's relationship to a workspace's specs:

| Ownership  | Meaning                                                           |
| ---------- | ----------------------------------------------------------------- |
| `owned`    | The project owns these specs; changes are freely proposed         |
| `shared`   | The project co-owns these specs; changes may require coordination |
| `readOnly` | The project reads but does not modify these specs                 |

Ownership defaults to `owned` for the `default` workspace and `readOnly` for non-`default` workspaces. Ownership affects whether changes can target specs in the workspace and whether approval gates apply.

#### ReadOnly enforcement

When a workspace's ownership is `readOnly`, the following operations MUST be rejected with `ReadOnlyWorkspaceError`:

1. **Change scope** — adding a spec from a `readOnly` workspace to a change via `change create --spec` or `change edit --add-spec` MUST fail. A `readOnly` spec cannot be part of a change's `specIds`.
2. **Archive** — `ArchiveChange` MUST reject archiving when any spec in the change belongs to a `readOnly` workspace. This is a defense-in-depth guard — upstream guards should prevent this state, but the archive MUST NOT silently merge deltas into protected specs.
3. **Direct spec writes** — `SpecRepository.save()` and `SpecRepository.saveMetadata()` MUST reject writes when the repository's workspace is `readOnly`. This is the lowest-level guard and cannot be bypassed by any code path.

Error messages MUST state what operation was blocked and why (the workspace is `readOnly`). Error messages MUST NOT suggest remediation steps (e.g. "change ownership in specd.yaml") to prevent LLM agents from autonomously modifying configuration to bypass the restriction.

`readOnly` workspaces MAY still be read — specs can be loaded, listed, used as context dependencies, and referenced in `dependsOn`. Only write operations are blocked.

`shared` ownership permits all write operations identical to `owned`. No enforcement distinction exists between `owned` and `shared` for write operations.

### Requirement: Prefix semantics

When a workspace declares a `prefix`, the prefix is prepended to all capability paths in that workspace. A spec stored at `architecture/` on disk becomes `<prefix>/architecture` in the specd model. When no prefix is declared, specs use bare capability paths.

Prefixes may be single-segment (`_global`) or multi-segment (`team/shared/core`). Two workspaces may share the same prefix — the prefix is not a unique identifier; the workspace name is.

Invalid prefix syntax produces a `ConfigValidationError` at startup.

### Requirement: Workspace-qualified spec IDs

Every spec is identified by a fully-qualified spec ID in the format `workspace:capabilityPath`. The colon separates the workspace name from the capability path; `/` always belongs to the capability path.

A bare path (no colon) is shorthand for `default:path`. An unknown workspace qualifier in a spec ID is rejected with an error.

Internally, specd always uses the fully-qualified form. The bare-path shorthand is a user-facing convenience only.

### Requirement: Active workspace determination

A workspace is considered active in the context of a change when at least one of the change's `specIds` belongs to that workspace. Active workspaces determine which workspace-level context patterns are applied during context compilation.

The set of active workspaces is derived at runtime from `specIds` via the `workspaces` computed getter, which extracts the workspace component of each spec ID using `parseSpecId()`. It is not a persisted field.

### Requirement: Primary workspace

The primary workspace of a change is the first entry in the computed `change.workspaces` (derived from `specIds`). It is used for:

- Archive path template resolution (`{{change.workspace}}`)
- Default metadata attribution when archiving

### Requirement: Port-per-workspace pattern

Use cases that operate across workspaces receive a `ReadonlyMap<string, RepositoryInstance>` keyed by workspace name. The composition layer constructs one repository instance per workspace declared in configuration and passes the complete map. Use cases look up the repository for a spec's workspace to resolve paths, load content, or write artifacts.

### Requirement: Workspace-level context patterns

Each workspace may declare `contextIncludeSpecs` and `contextExcludeSpecs` patterns. These are applied only when the workspace is active:

- Omitting the workspace qualifier in a workspace-level pattern means "this workspace" (not `default`)
- `['*']` means all specs in this workspace
- `['auth/*']` means specs under `auth/` in this workspace

Workspace-level patterns are evaluated after project-level patterns. Specs added via `dependsOn` traversal are never subject to exclude patterns.

### Requirement: Cross-workspace references

Specs may reference other specs in different workspaces using the qualified form (`billing:payments/invoices`) in `dependsOn`, context patterns, and delta targets. Schema references use `#workspace:name` syntax to resolve schemas from another workspace's local schema directory.

References to unknown workspaces are handled differently by context:

- At configuration validation time: error (abort)
- At runtime (context compilation): warning and skip

### Requirement: Workspace directory structure in changes

Change artifacts always include an explicit workspace segment in the path, even for single-workspace changes:

- New spec artifacts: `specs/<workspace>/<capability-path>/<artifact-filename>`
- Delta files: `deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml`

This ensures multi-workspace changes are unambiguous and tooling can resolve the correct repository without inspecting configuration.

### Requirement: Sole source of truth

Each project's `specd.yaml` is the sole source of truth for that project's view of workspaces. When a workspace's `specs` path points to an external repository, specd never reads the external repository's `specd.yaml`. All properties — paths, schemas, ownership, prefix — must be independently declared in the consuming project's configuration.

## Constraints

- Every project must declare a default workspace
- Workspace names must match /^\[a-z]\[a-z0-9-]\*$/
- codeRoot is required for non-default workspaces
- isExternal is inferred, never declared
- Spec IDs are always workspace-qualified internally
- A change's workspaces are derived from its specIds via parseSpecId() — not persisted
- When specIds is empty, workspaces is empty
- Workspace-level exclude patterns do not apply to specs reached via dependsOn
- External repository configurations are never read — each project declares its own view
- Change artifacts always include the workspace segment in their path
- ReadOnly workspaces reject all write operations — change scope additions, archive merges, and direct spec writes
- ReadOnly enforcement error messages must not suggest remediation steps

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — workspace properties are declared in the project configuration
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — spec IDs use workspace-qualified format

## ADRs

- [ADR-0013: Workspaces, Not Scopes](../../../docs/adr/0013-workspaces-not-scopes.md)

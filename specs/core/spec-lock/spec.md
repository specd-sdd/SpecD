# core:spec-lock

## Purpose

Archived specs need a durable sidecar that preserves spec identity, persisted dependencies, and implementation traceability independently of metadata regeneration or graph re-indexing. `spec-lock.json` is that sidecar: the canonical archived record for spec schema identity and implementation links.

## Requirements

### Requirement: Sidecar location and naming

The sidecar SHALL be a file named `spec-lock.json` located in the canonical persisted spec directory next to that spec's archived artifacts.

### Requirement: Durable schema identity

`spec-lock.json` MUST store the spec schema identity under `schema`.

- `schema.name` is required.
- `schema.version` is required.

Once recorded for a persisted spec, this schema identity MUST remain immutable unless the spec is explicitly migrated through a future schema-migration capability.

### Requirement: Persistent dependencies

`spec-lock.json` MUST store the final persisted `dependsOn` list for the archived spec as canonical spec IDs.

This sidecar list is the durable archived dependency record. Archive-time metadata generation and later metadata regeneration flows SHALL treat it as the authoritative persisted dependency state when projecting canonical `metadata.json.dependsOn`, including schemas that do not declare dependency extraction in their spec artifacts.

### Requirement: Archived implementation links

`spec-lock.json` MUST store archived implementation traceability under an `implementation` array.

Each entry MUST contain:

- `file` — the canonical implementation file identity in `workspace:path` form, where `workspace` is the workspace of `specId` and `path` is relative to that workspace `codeRoot`

Each entry MAY additionally contain:

- `symbols` — a non-empty array of symbol names when the archived link is symbol-level

When `symbols` is absent, the entry represents a file-level implementation link. When `symbols` is present, the entry represents symbol-level implementation traceability for that file.

### Requirement: Archive-time materialization

`spec-lock.json` SHALL be written or updated only by archive-time materialization and explicit integrity-maintenance flows.

Archive-time materialization MUST:

- read raw project-relative implementation paths from the active change state
- validate that each linked file belongs to the workspace implied by the archived `specId`
- ignore entries whose raw file path falls under that workspace's `graph.excludePaths`
- discard entries that cannot be normalized into a valid `workspace:path` identity
- fail archive when a confirmed link points outside the workspace `codeRoot` implied by `specId`

### Requirement: Sidecar is the durable source of truth

`spec-lock.json` MUST be the durable archived source of truth for implementation traceability.

`metadata.json` MAY project or cache this information for faster consumption, but metadata regeneration MUST NOT invent, mutate, or delete implementation links independently of the sidecar.

## Constraints

- `spec-lock.json` MUST be valid JSON.
- Canonical implementation file identities MUST use forward-slash-normalized `workspace:path` values.
- `symbols`, when present, MUST be non-empty.
- Sidecar maintenance MUST preserve file-level and symbol-level links as distinct archived traceability forms.

## Spec Dependencies

- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec ID conventions
- [`core:storage`](../storage/spec.md) — durable sidecar persistence

### Requirement: Sidecar is not a schema artifact

`spec-lock.json` is a persisted semantic sidecar, not a schema-declared spec artifact.

As a consequence:

- it MUST NOT appear in `Spec.filenames`
- it MUST NOT be accepted by the generic `SpecRepository.artifact()` / `save()` API
- it is read and written only through the repository's persisted-state semantic operations

This keeps the schema artifact surface stable across single-file and multi-file spec schemas while still allowing persisted dependency and implementation state to exist next to canonical spec artifacts.

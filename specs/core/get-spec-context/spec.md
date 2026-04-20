# Get Spec Context

## Purpose

AI agents and delivery mechanisms need to understand a spec together with everything it depends on, but dependency chains can be deep and metadata may be stale or missing. The `GetSpecContext` use case builds structured context entries for a single spec, optionally following `dependsOn` links transitively, to assemble the full context needed to understand a spec and its dependency chain. Metadata freshness is checked via SHA-256 content hashes; stale or absent metadata produces a minimal entry.

## Requirements

### Requirement: Resolve workspace and spec from input

The use case SHALL look up the `SpecRepository` for the given `workspace` name. If the workspace does not exist, it MUST throw a `WorkspaceNotFoundError`. It SHALL then load the spec via `repo.get(specPath)`. If the spec does not exist, it MUST throw a `SpecNotFoundError`.

### Requirement: Build context entry from metadata

For each resolved spec, the use case SHALL load all artifact files and attempt to read metadata via `SpecRepository.metadata()`. The rendered entry shape SHALL be controlled by the resolved `contextMode`:

- `list` — include only `spec`, `stale`, and mode/source metadata.
- `summary` — include `spec`, `stale`, title, and description when available.
- `full` — include `spec`, `stale`, title, description, rules, constraints, and scenarios when available.
- `hybrid` — equivalent to `full` for a single-spec context command, because there is no change-scoped tier.

When metadata exists and content hashes confirm freshness, the entry SHALL render from metadata according to that mode. In full mode, `rules`, `constraints`, and `scenarios` are included when no section filter is active or when the corresponding section is requested.

### Requirement: Stale or absent metadata produces minimal entry

When `SpecRepository.metadata()` returns `null` or content hashes indicate staleness, the use case SHALL emit a stale entry without pretending that full content is available.

- In `list` mode, the entry contains only `spec`, `stale: true`, and mode/source metadata.
- In `summary`, `full`, and `hybrid` modes, the entry contains `spec`, `stale: true`, and any title or description that can be safely extracted without fresh metadata.

No rules, constraints, or scenarios SHALL be included from stale metadata.

### Requirement: Section filtering

When `input.sections` is provided and non-empty, the entry MUST include only the listed section types (`'rules'`, `'constraints'`, `'scenarios'`) for full-mode output. The `title` and `description` fields SHALL only be included in full-mode output when no section filter is active.

Section filters MUST have no effect in `list` or `summary` modes. Those modes continue to emit list or summary-shaped entries regardless of requested sections.

### Requirement: Transitive dependency traversal

When `input.followDeps` is `true`, the use case SHALL read `dependsOn` from the root spec's metadata and recursively resolve each dependency. Dependency identifiers are parsed via `parseSpecId` using the current workspace as the default. Traversal SHALL use DFS with cycle detection — already-visited spec labels are skipped.

### Requirement: Depth limiting

When `input.depth` is provided and `followDeps` is `true`, the use case MUST NOT traverse beyond the specified depth. Depth 0 means only the root spec is resolved (no dependencies). When `depth` is not provided, traversal is unlimited.

### Requirement: Warnings for unresolvable dependencies

During dependency traversal, the use case SHALL emit warnings (not throw) for:

- Missing metadata on the current spec during traversal — `type: 'missing-metadata'`.
- Unknown workspace referenced in a dependency — `type: 'unknown-workspace'`.
- Dependency spec not found in its workspace — `type: 'missing-spec'`.
- Stale metadata on any resolved entry — `type: 'stale-metadata'`.

Warnings MUST be collected in the result's `warnings` array and MUST NOT interrupt traversal.

### Requirement: Result shape

`GetSpecContextResult` MUST include:

- `entries` — ordered array of `SpecContextEntry` objects (root first, then dependencies in DFS order).
- `warnings` — array of `ContextWarning` objects accumulated during resolution.

Each entry MUST include the canonical spec label and its display mode. List entries contain no content fields. Summary entries contain title and description when available. Full entries contain the metadata sections allowed by the section filter.

## Constraints

- The use case receives a `ReadonlyMap<string, SpecRepository>` — it MUST NOT modify the map or the repositories.
- Cycle detection uses the `workspace:capabilityPath` label as the identity key.
- The root spec is always included as the first entry, even if its metadata is stale.
- Empty `sections` array is treated the same as `undefined` (show all).

## Spec Dependencies

- [`core:core/config`](../config/spec.md) — `contextMode` accepted values and default
- [`core:core/compile-context`](../compile-context/spec.md) — shared display-mode vocabulary and context entry semantics
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — metadata structure, `dependsOn`, and `contentHashes`
- [`core:core/storage`](../storage/spec.md) — `SpecRepository` contract
- [`core:core/workspace`](../workspace/spec.md) — workspace resolution
- [`core:core/spec-id-format`](../spec-id-format/spec.md) — `parseSpecId` behaviour and default workspace

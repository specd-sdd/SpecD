# Get Spec Context

## Purpose

AI agents and delivery mechanisms need to understand a spec together with everything it depends on, but dependency chains can be deep and metadata may be stale or missing. The `GetSpecContext` use case builds structured context entries for a single spec, optionally following `dependsOn` links transitively, to assemble the full context needed to understand a spec and its dependency chain. Metadata freshness is checked via SHA-256 content hashes; stale or absent metadata produces a minimal entry.

## Requirements

### Requirement: Resolve workspace and spec from input

The use case SHALL look up the `SpecRepository` for the given `workspace` name. If the workspace does not exist, it MUST throw a `WorkspaceNotFoundError`. It SHALL then load the spec via `repo.get(specPath)`. If the spec does not exist, it MUST throw a `SpecNotFoundError`.

### Requirement: Build context entry from metadata

For each resolved spec, the use case SHALL load all artifact files and attempt to read metadata via `SpecRepository.metadata()`. When metadata exists and content hashes confirm freshness, the entry SHALL include:

- `spec` — display label in `workspace:capabilityPath` format.
- `stale` — `false`.
- `title` — from metadata, when present (included only when no section filter is active or all sections requested).
- `description` — from metadata, when present (same inclusion rule as `title`).
- `rules` — from metadata, when present and non-empty (included when no section filter or `'rules'` is in `sections`).
- `constraints` — from metadata, when present and non-empty (included when no section filter or `'constraints'` is in `sections`).
- `scenarios` — from metadata, when present and non-empty (included when no section filter or `'scenarios'` is in `sections`).

### Requirement: Stale or absent metadata produces minimal entry

When `SpecRepository.metadata()` returns `null` or content hashes indicate staleness, the use case SHALL return a minimal entry with only `spec` (the label) and `stale: true`. No title, description, rules, constraints, or scenarios SHALL be included.

### Requirement: Section filtering

When `input.sections` is provided and non-empty, the entry MUST include only the listed section types (`'rules'`, `'constraints'`, `'scenarios'`). The `title` and `description` fields SHALL only be included when no section filter is active (i.e. `sections` is `undefined` or empty).

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

## Constraints

- The use case receives a `ReadonlyMap<string, SpecRepository>` — it MUST NOT modify the map or the repositories.
- Cycle detection uses the `workspace:capabilityPath` label as the identity key.
- The root spec is always included as the first entry, even if its metadata is stale.
- Empty `sections` array is treated the same as `undefined` (show all).

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — metadata structure, `dependsOn`, and `contentHashes`
- [`specs/core/storage/spec.md`](../storage/spec.md) — `SpecRepository` contract
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace resolution
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — `parseSpecId` behaviour and default workspace

# Get Spec Context

## Purpose

AI agents and delivery mechanisms need to understand a spec together with everything it depends on, but dependency chains can be deep and metadata may be stale or missing. The `GetSpecContext` use case builds structured context entries for a single spec, optionally following `dependsOn` links transitively, to assemble the full context needed to understand a spec and its dependency chain. Metadata freshness is checked via SHA-256 content hashes; stale or absent metadata produces a minimal entry.

## Requirements

### Requirement: Resolve workspace and spec from input

The use case SHALL resolve the requested spec by first obtaining the corresponding `SpecRepository` through the `ListWorkspaces` orchestrator.

1. Get the list of `ProjectWorkspace` entities via `ListWorkspaces.execute()`.
2. Find the workspace matching the input `workspace` name. If not found, throw `WorkspaceNotFoundError`.
3. Load the spec via `repo.get(specPath)`. If the spec does not exist, throw `SpecNotFoundError`.

### Requirement: Build context entry from metadata

For each resolved spec, the use case SHALL load all artifact files and obtain usable metadata by calling `GetSpecMetadata.execute({ specId })` (default `'if-needed'` policy) rather than reading `SpecRepository.metadata()` directly. The rendered entry shape SHALL be controlled by the resolved `contextMode`:

- `list` — include only `spec`, `stale`, and mode/source metadata.
- `summary` — include `spec`, `stale`, title, and description when available.
- `full` — include `spec`, `stale`, title, description, rules, constraints, and scenarios when available.
- `hybrid` — equivalent to `full` for a single-spec context command, because there is no change-scoped tier.

When materialization succeeds, the entry SHALL render from the returned metadata according to that mode, and `stale` SHALL be `false`. In full mode, `rules`, `constraints`, and `scenarios` are included when no section filter is active or when the corresponding section is requested.

Cache-miss regeneration is provenance information carried on the materialization result (`source`, `regenerated`) and exposed through diagnostics surfaces — this use case MUST NOT emit a warning solely because a projection was regenerated. Only actionable materialization failures such as `metadata-cache-write-failed` SHALL be forwarded into the result's `warnings` array without being logged again by this use case.

### Requirement: Prefer LLM-optimized context

If `llmOptimizedContext: true` is active in the project configuration, the use case SHALL prefer `optimizedContext` for the spec if the materialized metadata reports it as present and fresh. If missing, stale, or empty, it SHALL fall back to the standard `context` and SHALL emit an optimization warning identifying the spec, with remediation instructions: "Launch specd-spec-context-optimizer agent to refresh".

The warning type MUST distinguish the two conditions:

- `missing-optimization` — the spec's lock-owned state records no optimization value for the field at all (never optimized).
- `stale-optimization` — an optimization is recorded but its artifact or schema baselines no longer match the current persisted artifacts (drifted after a content change).

Optimization freshness is derived from the per-field artifact and schema baselines recorded on the spec's lock-owned optimization state (see [`core:spec-optimization`](../spec-optimization/spec.md)), not from the metadata document's own freshness.

### Requirement: Stale or absent metadata produces minimal entry

When `GetSpecMetadata.execute({ specId })` cannot produce a valid in-memory projection (for example the schema declares no `metadataExtraction` and generation yields nothing), the use case SHALL emit a stale entry without pretending that full content is available.

- In `list` mode, the entry contains only `spec`, `stale: true`, and mode/source metadata.
- In `summary`, `full`, and `hybrid` modes, the entry contains `spec`, `stale: true`, and any title or description that can be safely extracted without a valid materialized projection.

No rules, constraints, or scenarios SHALL be included when materialization could not produce a projection. This is a materialization failure, not a raw content-hash staleness check — `GetSpecMetadata` already regenerates a missing or drifted cache internally.

### Requirement: Section filtering

When `input.sections` is provided and non-empty, the entry MUST include only the listed section types (`'rules'`, `'constraints'`, `'scenarios'`) for full-mode output. The `title` and `description` fields SHALL only be included in full-mode output when no section filter is active.

Section filters MUST have no effect in `list` or `summary` modes. Those modes continue to emit list or summary-shaped entries regardless of requested sections.

### Requirement: Transitive dependency traversal

When `input.followDeps` is `true`, the use case SHALL traverse dependencies transitively. For each unvisited spec identity:

1. Resolve the canonical dependency list from the metadata returned by `GetSpecMetadata.execute({ specId })` — this is self-healing, so a missing or stale cache is regenerated rather than treated as a frozen stale snapshot.
2. If materialization cannot produce a projection at all, MAY fall back to the schema's `metadataExtraction.dependsOn` declarations when the schema provides them.
3. If neither materialized metadata nor extraction yields dependencies, treat the spec as having no outgoing dependencies.

Traversal SHALL use DFS with cycle detection.

### Requirement: Depth limiting

When `input.depth` is provided and `followDeps` is `true`, the use case MUST NOT traverse beyond the specified depth. Depth 0 means only the root spec is resolved (no dependencies). When `depth` is not provided, traversal is unlimited.

### Requirement: Warnings for unresolvable dependencies

During dependency traversal, the use case SHALL emit warnings (not throw) for:

- Materialization unable to produce a usable projection for the current spec during traversal — `type: 'missing-metadata'`.
- Unknown workspace referenced in a dependency — `type: 'unknown-workspace'`.
- Dependency spec not found in its workspace — `type: 'missing-spec'`.
- Stale or missing lock-owned optimization fields on any resolved entry, when `llmOptimizedContext` is active — `type: 'stale-optimization'`.

Warnings MUST be collected in the result's `warnings` array and MUST NOT interrupt traversal.

The use case MUST NOT read `spec-lock.json` through generic artifact access in order to continue traversal. Persisted sidecars influence traversal only through `GetSpecMetadata`'s normalized projection.

### Requirement: Result shape

`GetSpecContextResult` MUST include:

- `entries` — ordered array of `SpecContextEntry` objects (root first, then dependencies in DFS order).
- `warnings` — array of `ContextWarning` objects accumulated during resolution.

Each entry MUST include the canonical spec label and its display mode. List entries contain no content fields. Summary entries contain title and description when available. Full entries contain the metadata sections allowed by the section filter.

### Requirement: Config-based factory delegates through resolveGetSpecContextDeps

The config-based `createGetSpecContext(config, options?)` form MUST derive `GetSpecContextDeps` through `resolveGetSpecContextDeps(resolver)` and then delegate to canonical `createGetSpecContext(deps)`.

`resolveGetSpecContextDeps(resolver)` MUST resolve:

- `listWorkspaces: ListWorkspaces`
- `hasher: ContentHasher`
- `getMetadata: GetSpecMetadata`
- `schemaProvider?: SchemaProvider`
- `parsers?: ArtifactParserRegistry`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case MUST obtain repository access through the orchestrated `ListWorkspaces` result and MUST NOT mutate the returned workspace entities or their repositories.
- Cycle detection uses the `workspace:capabilityPath` label as the identity key.
- The root spec is always included as the first entry, even if its metadata is stale.
- Empty `sections` array is treated the same as `undefined` (show all).

## Spec Dependencies

- [`core:config`](../config/spec.md)
- [`core:compile-context`](../compile-context/spec.md)
- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:workspace`](../workspace/spec.md)
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:list-workspaces`](../list-workspaces/spec.md)
- [`core:get-spec-metadata`](../get-spec-metadata/spec.md) — self-healing metadata read (`if-needed`) replacing direct repository freshness checks
- [`core:spec-optimization`](../spec-optimization/spec.md) — per-field optimization freshness backing stale/missing optimization diagnostics
- [`core:composition-resolver`](../composition-resolver/spec.md)

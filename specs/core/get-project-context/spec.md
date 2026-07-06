# GetProjectContext

## Purpose

Tooling sometimes needs the project's compiled spec context without an active change — for example, when generating agent instructions or answering project-wide queries. `GetProjectContext` provides this by compiling the project-level context block (steps 1-4 of the compilation pipeline: `context:` entries, project-level include/exclude patterns) with all configured workspaces treated as active. It is the change-independent counterpart to `CompileContext`.

## Requirements

### Requirement: Accepts GetProjectContextInput as input

`execute(input)` MUST accept a `GetProjectContextInput` object with the following fields:

- `contextMode` (`'list' | 'summary' | 'full' | 'hybrid'`, optional) — runtime override for display mode. When absent, the baked default from construction is used.
- `llmOptimizedContext` (boolean, optional) — runtime override for whether optimized context is preferred. When absent, the baked default from construction is used.
- `followDeps` (boolean, optional) — when `true`, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs beyond those matched by include/exclude patterns. When `false` or absent, traversal is not performed.
- `depth` (number, optional) — limits `dependsOn` traversal depth. Only meaningful when `followDeps` is `true`. `1` means direct dependencies only; absent means unlimited.
- `sections` (`ReadonlyArray<SpecSection>`, optional) — restricts which metadata sections are rendered per full-mode spec (`"rules"`, `"constraints"`, `"scenarios"`). It has no effect for list-mode or summary-mode entries.

`GetProjectContextInput` MUST NOT include a `config` field.

### Requirement: Returns GetProjectContextResult on success

`execute` MUST return a `GetProjectContextResult` containing:

- `contextEntries` (string\[]) — rendered project-level context entries (instruction text or file content).
- `specs` (ContextSpecEntry\[]) — specs matched by include/exclude patterns, each with `specId`, `source`, `mode`, and optional `title`, `description`, and `content` fields according to the display mode. The `ContextSpecEntry` type is the same as defined in the `CompileContext` spec.
- `warnings` (ContextWarning\[]) — advisory warnings for missing files, stale metadata, unknown workspaces, etc.

Since `GetProjectContext` operates without a change, all specs MUST have `source: 'includePattern'`. The mode field is determined by `config.contextMode`: `list` emits list entries, `summary` emits summary entries, and `full` or `hybrid` emits full entries. Project context has no direct change specs, so `hybrid` is equivalent to `full`. **`full` mode rendering MUST use structured output (derived from metadata or extraction) instead of raw markdown.**

### Requirement: Resolves schema before processing

The use case MUST obtain the project's schema via `SchemaProvider.get()` before processing any specs. If the schema cannot be resolved, `get()` throws `SchemaNotFoundError` or `SchemaValidationError` — the use case does not catch these.

### Requirement: Renders project-level context entries

For each entry in `config.context`:

- If the entry has an `instruction` key, the instruction text MUST be rendered with the label `**Source: instruction**`.
- If the entry has a `file` key, the file content MUST be read via the `FileReader` port. If the file exists, its content is rendered with the label `**Source: <path>**` and headings shifted down by one level. If the file does not exist, a `missing-file` warning MUST be emitted and the entry skipped.

Context entries MUST appear in declaration order and before any spec content.

### Requirement: Applies project-level include/exclude patterns

The use case MUST apply `config.contextIncludeSpecs` patterns to collect specs across all workspaces, then apply `config.contextExcludeSpecs` patterns to remove specs from the collected set. Pattern matching MUST use the same `listMatchingSpecs` logic as `CompileContext`, treating all workspaces as active.

### Requirement: Does not apply workspace-level patterns

The use case MUST NOT apply workspace-level `contextIncludeSpecs` or `contextExcludeSpecs` patterns. Those are conditional on a specific change having that workspace active and are the responsibility of `CompileContext`.

### Requirement: Supports dependsOn traversal when followDeps is true

When `input.followDeps` is `true`, the use case MUST traverse `dependsOn` links starting from each included spec.

Traversal resolves dependencies in this order:

1. canonical `metadata.json.dependsOn` when persisted metadata is available
2. the schema's `metadataExtraction.dependsOn` declarations as a fallback when metadata is absent

If metadata exists but is stale, the use case MAY still traverse using the persisted canonical `dependsOn` projection, but it MUST emit a `stale-metadata` warning. The use case MUST NOT treat stale metadata as though it were missing.

That fallback extraction MUST use the same shared extractor-transform registry and caller-owned origin context bag used by the other metadata-extraction consumers. Newly discovered specs MUST be added to the included set. Traversal MUST respect `input.depth` when provided.

If fallback extraction finds dependency values but transform execution cannot normalize them, the use case MUST fail explicitly rather than silently treating those dependencies as absent.

The use case MUST NOT read `spec-lock.json` as a generic spec artifact to discover dependencies; persisted sidecars are consumed through the canonical metadata projection.

### Requirement: Renders spec content from metadata when fresh

For each included spec, if `.specd-metadata.yaml` exists and its content hashes match the current artifacts (verified via `ContentHasher`), the use case MUST render from the parsed metadata according to `config.contextMode`.

- In `list` mode, render no title, description, or content.
- In `summary` mode, render title and description only.
- In `full` mode, render description, rules, constraints, and scenarios as applicable. **If no `sections` filter is active (input is absent or empty), it MUST default to rendering Description + Rules + Constraints.** If a `sections` filter is provided, it overrides this default.
- In `hybrid` mode, render the same output as `full` because project context has no change-scoped tier.

Section filters MUST NOT affect list-mode or summary-mode entries.

#### Scenario: Default sections in full mode

When a spec is rendered in `full` mode (including `hybrid` mode which resolves to `full` here) and no `sections` filter is active (input is absent or empty), it MUST default to rendering **Description + Rules + Constraints**.

### Requirement: Falls back to extraction when metadata is stale or absent

When metadata is stale or absent, the use case MUST:

1. Emit a `stale-metadata` warning identifying the spec.
2. Attempt live extraction using the schema's `metadataExtraction` engine, the shared extractor-transform registry, and caller-owned origin context for each artifact.
3. If extraction yields content, render it with the same section filtering as fresh metadata.
4. If the schema has no `metadataExtraction` declarations, render an empty spec heading.

If extraction finds values for transformed fields but transform execution cannot normalize them, the use case MUST fail explicitly instead of silently omitting those found values from the rendered fallback content.

### Requirement: Construction dependencies

`GetProjectContext` depends on the following ports/services injected via constructor:

- `listWorkspaces` (`ListWorkspaces`) — project orchestrator providing access to configured workspaces
- `schemaProvider` (`SchemaProvider`) — lazy, caching provider for the fully-resolved schema
- `files` (`FileReader`) — for reading context entry files from disk
- `parsers` (`ArtifactParserRegistry`) — for parsing spec artifacts when metadata is stale
- `hasher` (`ContentHasher`) — for comparing content hashes against metadata
- `defaultConfig` (`CompileContextConfig`) — yaml-derived project context configuration snapshot baked at kernel composition time

All dependencies are injected at construction time. The schema is resolved lazily on first access.

At the start of `execute`, `GetProjectContext` MUST build the effective `CompileContextConfig` by shallow-merging `defaultConfig` with any runtime overrides (`contextMode`, `llmOptimizedContext`) present on the input. Hosts MUST NOT pass yaml-derived configuration on each call.

### Requirement: Project context optimization and invalidation

When `llmOptimizedContext` is enabled, the system MUST prefer using the cached optimized project context from `project-metadata.json` if it is fresh.

When `llmOptimizedContext` is disabled, the use case MUST NOT return the cached optimized project context as the primary response, even if the cache is fresh. In that case it MUST continue with the standard compilation flow.

The system SHALL verify the freshness of the cached context by comparing the stored hashes in `freshness` against the current state of:

- `specd.yaml`
- Referenced `contextFiles`
- Metadata of included specs

If all hashes match and `optimized.context` exists and is not empty, the use case SHALL use the optimized context only when optimization is enabled. Otherwise, the system MUST emit a warning and fall back to the standard compilation process.

The warning message MUST include remediation instructions: "Launch specd-project-context-optimizer agent to generate it".

### Requirement: Config-based factory delegates through resolveGetProjectContextDeps

The config-based `createGetProjectContext(config, options?)` form MUST derive `GetProjectContextDeps` through `resolveGetProjectContextDeps(resolver)` and then delegate to canonical `createGetProjectContext(deps)`.

`resolveGetProjectContextDeps(resolver)` MUST resolve:

- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `files: FileReader`
- `parsers: ArtifactParserRegistry`
- `hasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `defaultConfig: CompileContextConfig`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- The use case operates without a change context — it treats all workspaces as active.
- Workspace-level context patterns are never applied — only project-level patterns.
- Specs matched by multiple include patterns appear only once.
- Context entries are always rendered before spec content.
- The use case is async — it returns `Promise<GetProjectContextResult>`.
- Spec rendering uses the same formatting logic as `CompileContext` (heading levels, section labels).
- `dependsOn` traversal is only performed when explicitly requested via `followDeps: true`.

## Spec Dependencies

- [`core:config`](../config/spec.md)
- [`core:compile-context`](../compile-context/spec.md)
- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:core/project-metadata`](../core/project-metadata/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)

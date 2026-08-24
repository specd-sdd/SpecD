# Verification: GetProjectContext

## Requirements

### Requirement: Accepts GetProjectContextInput as input

#### Scenario: Minimal input with no overrides

- **GIVEN** `GetProjectContext` was constructed with a baked default configuration
- **WHEN** `execute` is called with `{}`
- **THEN** the call succeeds using the baked default snapshot

#### Scenario: Full optional input supported

- **WHEN** `execute` is called with `followDeps: true`, `depth: 2`, `sections: ["rules"]`, and `contextMode: "full"`
- **THEN** the call succeeds and respects all optional parameters
- **AND** no `config` field is required

#### Scenario: Sections only affect full-mode rendering

- **GIVEN** `contextMode` resolves to `list` or `summary`
- **WHEN** `execute` is called with section filters
- **THEN** emitted entries remain list/summary shaped without full content sections

### Requirement: Returns GetProjectContextResult on success

#### Scenario: Result contains structured spec entries

- **GIVEN** project-level include patterns match specs
- **WHEN** `GetProjectContext.execute` is called
- **THEN** `result.specs` is an array of context entries with `specId`, `source`, and `mode`

#### Scenario: Summary mode emits summary entries

- **GIVEN** `contextMode: "summary"`
- **WHEN** `GetProjectContext.execute` is called
- **THEN** all emitted spec entries use summary mode

#### Scenario: List mode emits list entries

- **GIVEN** `contextMode: "list"`
- **WHEN** `GetProjectContext.execute` is called
- **THEN** all emitted spec entries use list mode

#### Scenario: Full and hybrid modes emit full entries in project context

- **GIVEN** `contextMode: "full"` or `contextMode: "hybrid"`
- **WHEN** `GetProjectContext.execute` is called
- **THEN** all emitted spec entries use full mode

### Requirement: Resolves schema before processing

#### Scenario: Schema resolution failure propagates

- **WHEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **THEN** the error propagates — the use case does not catch it

### Requirement: Renders project-level context entries

#### Scenario: Instruction entry rendered

- **GIVEN** `config.context` contains `{ instruction: "Always use TypeScript" }`
- **WHEN** `execute` is called
- **THEN** `contextEntries` contains a string starting with `**Source: instruction**` followed by the instruction text

#### Scenario: File entry rendered

- **GIVEN** `config.context` contains `{ file: "AGENTS.md" }` and the file exists with content
- **WHEN** `execute` is called
- **THEN** `contextEntries` contains a string starting with `**Source: AGENTS.md**` followed by the file content with headings shifted

#### Scenario: Missing file emits warning

- **GIVEN** `config.context` contains `{ file: "missing.md" }` and the file does not exist
- **WHEN** `execute` is called
- **THEN** `warnings` contains a `missing-file` warning for `missing.md`
- **AND** `contextEntries` does not include an entry for the missing file

#### Scenario: Context entries appear in declaration order

- **GIVEN** `config.context` contains `[{ instruction: "first" }, { file: "second.md" }]` and `second.md` exists
- **WHEN** `execute` is called
- **THEN** `contextEntries[0]` contains "first" and `contextEntries[1]` contains "second.md"

### Requirement: Applies project-level include/exclude patterns

#### Scenario: Include pattern matches specs

- **GIVEN** `config.contextIncludeSpecs` is `["default:*"]` and the default workspace has specs
- **WHEN** `execute` is called
- **THEN** `specs` contains entries for all specs in the default workspace

#### Scenario: Exclude pattern removes specs

- **GIVEN** `config.contextIncludeSpecs` is `["default:*"]` and `config.contextExcludeSpecs` is `["default:drafts/*"]`
- **WHEN** `execute` is called
- **THEN** `specs` does not contain any spec under `drafts/`

#### Scenario: Specs deduplicated across patterns

- **GIVEN** `config.contextIncludeSpecs` is `["default:architecture", "default:*"]`
- **WHEN** `execute` is called
- **THEN** the `architecture` spec appears exactly once in `specs`

### Requirement: Does not apply workspace-level patterns

#### Scenario: Workspace-level patterns ignored

- **GIVEN** a workspace declares `contextIncludeSpecs: ["extra/*"]` at workspace level
- **WHEN** `execute` is called
- **THEN** specs matched only by the workspace-level pattern are not included

### Requirement: Supports dependsOn traversal when followDeps is true

#### Scenario: DependsOn traversal discovers additional specs

- **GIVEN** spec A's metadata has `dependsOn: ["default:B"]` and spec B exists
- **WHEN** `execute` is called with `followDeps: true` and spec A is in the include set
- **THEN** `specs` contains both spec A and spec B

#### Scenario: DependsOn traversal respects depth limit

- **GIVEN** spec A depends on B and B depends on C
- **WHEN** `execute` is called with `followDeps: true` and `depth: 1`
- **THEN** `specs` contains A and B but not C

#### Scenario: Materialized dependency projection works without extraction

- **GIVEN** an included persisted spec's materialized metadata reports `dependsOn`
- **AND** the active schema omits `metadataExtraction.dependsOn`
- **WHEN** `execute` is called with `followDeps: true`
- **THEN** traversal still discovers those dependencies from the materialized projection

#### Scenario: Self-healed drifted cache remains usable for traversal without falling back

- **GIVEN** an included spec's persisted metadata cache is drifted or stale
- **AND** `GetSpecMetadata` successfully regenerates a fresh projection for it
- **WHEN** `execute` is called with `followDeps: true`
- **THEN** traversal uses the regenerated `dependsOn` projection
- **AND** the spec is not treated as metadata-missing

#### Scenario: DependsOn traversal falls back to transform-backed extraction only when materialization fails

- **GIVEN** materialization cannot produce a projection at all for a spec
- **AND** the schema declares `metadataExtraction.dependsOn` with a transform such as `resolveSpecPath`
- **WHEN** `execute` is called with `followDeps: true`
- **THEN** traversal uses live extraction with the shared transform registry and origin context to discover additional specs

#### Scenario: DependsOn traversal does not silently drop found dependency values

- **GIVEN** extraction finds dependency values for a spec whose metadata cannot be materialized
- **AND** transform execution cannot normalize those values
- **WHEN** `execute` is called with `followDeps: true`
- **THEN** traversal fails explicitly instead of treating the spec as having no dependencies

#### Scenario: Traversal never reads spec-lock.json as a generic artifact

- **WHEN** `dependsOn` traversal needs persisted sidecar influence
- **THEN** it consumes that influence only through `GetSpecMetadata`'s normalized projection
- **AND** it does not read `spec-lock.json` as a generic spec artifact

### Requirement: Renders spec content from metadata when fresh

#### Scenario: Materialized metadata rendered with all sections in full mode

- **GIVEN** a spec's metadata materializes successfully
- **AND** the effective display mode is full
- **WHEN** `execute` is called without `sections` filter
- **THEN** the spec entry includes Title, Description, Rules, and Constraints (default sections)

#### Scenario: Sections filter restricts full output

- **GIVEN** a spec's metadata materializes successfully
- **AND** the effective display mode is full
- **WHEN** `execute` is called with `sections: ["rules"]`
- **THEN** the spec entry includes Title and Description (header persistence)
- **AND** the spec entry includes Rules but not scenarios or constraints

#### Scenario: Materialization warnings forwarded without duplicate logging

- **GIVEN** `GetSpecMetadata` returns a `metadata-cache-write-failed` or generation warning while still producing usable content for an included spec
- **WHEN** `GetProjectContext` renders that spec
- **THEN** the warning is forwarded into the result's `warnings` array
- **AND** it is not logged again by this use case

#### Scenario: Cache-miss regeneration does not emit a warning

- **GIVEN** `GetSpecMetadata` regenerates a projection (`regenerated: true`) without persistence failures
- **WHEN** `GetProjectContext` renders that spec
- **THEN** the entry renders normally from the regenerated projection
- **AND** no warning about the regeneration appears in `warnings`

#### Scenario: Per-spec optimization warning distinguishes missing vs stale

- **GIVEN** `llmOptimizedContext: true`
- **AND** an included spec whose materialized projection lacks usable `optimizedContext`
- **WHEN** `GetProjectContext` renders that spec
- **THEN** the warning type is `missing-optimization` when the lock records no optimization
- **AND** the warning type is `stale-optimization` when the lock records an optimization with drifted baselines

#### Scenario: Only rendered specs are materialized

- **GIVEN** `contextMode: "list"` and one or more included specs
- **WHEN** `GetProjectContext` assembles the result
- **THEN** it does not call `GetSpecMetadata` for those list-mode entries
- **AND** emitted entries remain list-shaped without title, description, or content

### Requirement: Falls back to extraction when metadata is stale or absent

#### Scenario: Materialization failure emits missing-metadata warning and falls back to extraction

- **GIVEN** a spec's metadata cannot be materialized at all
- **WHEN** `execute` is called
- **THEN** `warnings` contains a `missing-metadata` warning for that spec
- **AND** the spec's `content` is rendered via live extraction if the schema supports it

#### Scenario: Fallback extraction uses shared transform registry

- **GIVEN** the schema declares transforms inside `metadataExtraction`
- **WHEN** `GetProjectContext` falls back to live extraction after a materialization failure
- **THEN** it uses the shared extractor-transform registry and origin context for the artifact being rendered

#### Scenario: Fallback extraction does not silently drop found transformed values

- **GIVEN** live fallback extraction finds a value for a transformed field
- **AND** the transform cannot normalize that value
- **WHEN** `GetProjectContext` renders fallback content
- **THEN** the fallback path fails explicitly instead of silently omitting the found value

#### Scenario: No metadataExtraction in schema yields empty content

- **GIVEN** a spec's metadata cannot be materialized and the schema has no `metadataExtraction` declarations
- **WHEN** `execute` is called
- **THEN** the spec's `content` contains only the spec heading with no body

### Requirement: Construction dependencies

#### Scenario: Constructor accepts all required ports and default config

- **WHEN** `GetProjectContext` is instantiated from a resolved `SpecdConfig`
- **THEN** it requires `listWorkspaces`, `schemaProvider`, `files`, `getMetadata`, `parsers`, and a yaml-derived `CompileContextConfig` default snapshot in its constructor

#### Scenario: Effective config built via shallow merge of defaults and runtime overrides

- **GIVEN** `GetProjectContext` was constructed with a baked `defaultConfig`
- **WHEN** `execute(input)` is called with `contextMode` or `llmOptimizedContext` overrides
- **THEN** the effective `CompileContextConfig` is built by shallow-merging `defaultConfig` with those overrides
- **AND** hosts are not required to pass yaml-derived configuration on each call

### Requirement: Project context optimization and invalidation

#### Scenario: Uses optimized project context when fresh

- **GIVEN** `llmOptimizedContext: true`
- **AND** `project-metadata.json` exists and its semantic metadata fingerprints (`specd.yaml`, referenced `contextFiles`, and the materialized metadata fingerprint of every included spec) all match current state
- **WHEN** project context is retrieved
- **THEN** the result uses `optimized.context`

#### Scenario: Fresh optimized cache is ignored when llmOptimizedContext is disabled

- **GIVEN** `llmOptimizedContext: false`
- **AND** `project-metadata.json` exists and is otherwise fresh
- **WHEN** project context is retrieved
- **THEN** the use case does not return `optimized.context` as the primary response
- **AND** it continues with the standard compilation flow

#### Scenario: Falls back and warns when project context is stale

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** the project context cache is stale or missing (e.g. due to a `specd.yaml` or included-spec fingerprint mismatch)
- **WHEN** project context is compiled
- **THEN** it falls back to raw compilation
- **AND** it emits a warning
- **AND** the warning message mentions `specd-project-context-optimizer`

#### Scenario: Freshness is derived from semantic fingerprints, not raw cache-file hashes

- **GIVEN** a `project-metadata.json` cache whose raw file bytes changed but whose `specd.yaml`, `contextFiles`, and per-spec materialized metadata fingerprints are unchanged
- **WHEN** project context freshness is evaluated
- **THEN** the cache is still considered fresh
- **AND** raw cache-file hashes or repository revisions are not used to determine freshness

### Requirement: Config-based factory delegates through resolveGetProjectContextDeps

#### Scenario: createGetProjectContext config form derives GetProjectContextDeps through resolveGetProjectContextDeps

- **WHEN** `createGetProjectContext(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetProjectContextDeps` through `resolveGetProjectContextDeps(resolver)`
- **AND** `resolveGetProjectContextDeps(resolver)` resolves:
- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `files: FileReader`
- `getMetadata: GetSpecMetadata`
- `parsers: ArtifactParserRegistry`
- `hasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `defaultConfig: CompileContextConfig`
- **AND** the factory delegates to canonical `createGetProjectContext(deps)`

#### Scenario: resolveGetProjectContextDeps wires GetSpecMetadata for self-healing

- **WHEN** `resolveGetProjectContextDeps(resolver)` runs
- **THEN** the resolved deps include `getMetadata: GetSpecMetadata`
- **AND** it replaces direct content-hash freshness checks for spec title/description/section rendering

# Verification: CompileContext

## Requirements

### Requirement: Context spec collection

#### Scenario: includeChangeSpecs false skips direct change spec seed

- **GIVEN** a change with `specIds: ["core:config"]`
- **AND** `core:config` is not matched by include patterns and not discovered via traversal
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: false`
- **THEN** `core:config` is not included solely because it is in `change.specIds`

#### Scenario: includeChangeSpecs true keeps direct change spec even if excluded

- **GIVEN** a change with `specIds: ["core:config"]`
- **AND** an exclude pattern matches `core:config`
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: true`
- **THEN** `core:config` remains in the collected set as a mandatory direct seed

#### Scenario: includeChangeSpecs false allows reinjection through include patterns

- **GIVEN** a change with `specIds: ["core:config"]`
- **AND** project include patterns match `core:config`
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: false`
- **THEN** `core:config` is still included through include-pattern collection

#### Scenario: includeChangeSpecs false allows reinjection through traversal

- **GIVEN** a change with `specIds: ["core:config"]`
- **AND** another spec in traversal depends on `core:config`
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: false` and `followDeps: true`
- **THEN** `core:config` is included through `dependsOn` traversal

### Requirement: Context display modes

#### Scenario: Summary mode is the default when contextMode is omitted

- **GIVEN** `contextMode` is not declared in config
- **WHEN** `CompileContext.execute` is called
- **THEN** collected specs are emitted in summary mode unless another mode is explicitly requested

#### Scenario: List mode emits list entries only

- **GIVEN** `contextMode: "list"`
- **WHEN** `CompileContext.execute` is called
- **THEN** every emitted spec entry has `mode: "list"`

#### Scenario: Summary mode emits summary entries only

- **GIVEN** `contextMode: "summary"`
- **WHEN** `CompileContext.execute` is called
- **THEN** every emitted spec entry has `mode: "summary"`

#### Scenario: Full mode emits full entries only

- **GIVEN** `contextMode: "full"`
- **WHEN** `CompileContext.execute` is called
- **THEN** every emitted spec entry has `mode: "full"`
- **AND** each emitted entry contains structured content (Title, Description, etc.)

#### Scenario: Hybrid mode renders direct change specs in full

- **GIVEN** `contextMode: "hybrid"`
- **AND** `includeChangeSpecs: true`
- **AND** a spec is in `change.specIds`
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted in `full` mode with Description, Rules, and Constraints by default

#### Scenario: Hybrid mode renders non-direct specs as summary

- **GIVEN** `contextMode: "hybrid"`
- **AND** a spec is collected from include patterns or traversal and is not a direct included change spec
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted in summary mode

### Requirement: Cycle detection during dependsOn traversal

#### Scenario: Cycle broken without infinite loop

- **GIVEN** `auth/login` depends on `auth/jwt` and `auth/jwt` depends back on `auth/login`
- **WHEN** `CompileContext.execute` traverses `dependsOn`
- **THEN** both specs are included if they can be reached before the repeated edge is cut
- **AND** no infinite loop occurs
- **AND** no cycle warning is emitted

### Requirement: Staleness detection and content fallback

#### Scenario: Stale metadata emits warning

- **GIVEN** `auth/jwt` metadata has `contentHashes.spec.md: 'sha256:old'`
- **AND** the current `spec.md` hashes to `sha256:new`
- **WHEN** `CompileContext.execute` adds `auth/jwt` via `dependsOn` traversal
- **THEN** the result `warnings` includes a staleness warning for `auth/jwt`

#### Scenario: Fresh metadata emits no staleness warning

- **GIVEN** all `contentHashes` in metadata match the current file hashes
- **WHEN** `CompileContext.execute` is called
- **THEN** no staleness warnings are emitted

#### Scenario: Fallback rendering uses shared transform registry

- **GIVEN** a spec has stale metadata
- **AND** the schema declares transforms in its metadata extraction rules
- **WHEN** `CompileContext.execute` falls back to live extraction for rendered content
- **THEN** that fallback uses the shared extractor-transform registry and origin context for the spec artifacts

#### Scenario: Fallback rendering fails explicitly when transform cannot normalize a found value

- **GIVEN** stale metadata triggers live extraction fallback
- **AND** the fallback extraction finds a value for a transformed field
- **AND** the transform cannot normalize that value
- **WHEN** `CompileContext.execute` renders fallback content
- **THEN** the fallback path fails explicitly instead of silently dropping the found value

### Requirement: Missing spec IDs emit a warning

#### Scenario: Non-existent spec ID emits a warning

- **GIVEN** an include pattern matches a spec ID that does not exist in `SpecRepository`
- **WHEN** `CompileContext.execute` is called
- **THEN** a warning is emitted identifying the missing path, the path is skipped, and no error is thrown

### Requirement: dependsOn resolution order

#### Scenario: Missing metadata during dependsOn traversal emits warning

- **GIVEN** `change.specIds` includes `auth/login`
- **AND** `auth/login` has no metadata
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** `result.warnings` includes a `missing-metadata` warning for `auth/login`

#### Scenario: Canonical metadata dependency projection works without extraction

- **GIVEN** a traversed persisted spec has fresh `metadata.json.dependsOn`
- **AND** the active schema omits `metadataExtraction.dependsOn`
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** traversal still uses that metadata dependency list

#### Scenario: Stale metadata dependency projection remains second-tier input

- **GIVEN** `change.specDependsOn` has no entry for a traversed spec
- **AND** that spec has persisted `metadata.json.dependsOn`
- **AND** the metadata is marked stale
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** traversal still uses the persisted metadata dependency list before any extraction fallback
- **AND** `result.warnings` includes `stale-metadata`

#### Scenario: Fallback to transform-backed extraction when metadata absent in dependsOn traversal

- **GIVEN** the schema declares `metadataExtraction.dependsOn`
- **AND** a spec in the `dependsOn` traversal has no metadata
- **AND** the spec's artifact content contains extractable dependency references
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** dependencies are extracted from the spec content via the `metadataExtraction` engine using the shared transform registry and origin context
- **AND** a `missing-metadata` warning is still emitted

#### Scenario: Fallback dependency extraction does not silently drop found values

- **GIVEN** a spec in the `dependsOn` traversal has no metadata
- **AND** its artifact content contains dependency references that are extracted
- **AND** transform execution cannot normalize those found values
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** the traversal fails explicitly instead of treating the spec as having no dependencies

#### Scenario: Manifest specDependsOn used as primary source for dependencies

- **GIVEN** `change.specDependsOn` has an entry for `auth/login` with `['auth/shared']`
- **AND** `auth/login` metadata declares `dependsOn: ['auth/jwt']`
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** `auth/shared` is used as the dependency from the manifest, not `auth/jwt` from metadata

### Requirement: Unknown workspace qualifiers emit a warning

#### Scenario: Unknown workspace qualifier in include pattern

- **GIVEN** `contextIncludeSpecs: ['unknown-workspace:*']`
- **AND** `unknown-workspace` is not declared in the active config
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.warnings` includes a warning about the unknown qualifier
- **AND** no exception is thrown

### Requirement: Context fingerprint

#### Scenario: Fingerprint calculated from context-only result

- **GIVEN** a change with project context entries, collected specs, and context warnings
- **WHEN** `CompileContext.execute` is called without a fingerprint
- **THEN** a fingerprint is calculated from the canonicalized context-only result and included in the response

#### Scenario: Unchanged status returned when fingerprint matches

- **GIVEN** the current compiled context fingerprint is `sha256:abc123...`
- **WHEN** `CompileContext.execute` is called with `fingerprint: 'sha256:abc123...'`
- **THEN** the result `status` is `'unchanged'`
- **AND** `projectContext` and `specs` are empty arrays

#### Scenario: Lifecycle-only changes preserve the fingerprint

- **GIVEN** a compiled context with a recorded fingerprint
- **WHEN** the change lifecycle state, readiness, or blockers change without changing emitted project context, specs, warnings, or result-shaping inputs
- **THEN** the new context fingerprint equals the recorded fingerprint
- **AND** a request with that fingerprint returns `status: 'unchanged'`

#### Scenario: Fingerprint changes when emitted specs or warnings change

- **GIVEN** a compiled context with a recorded fingerprint
- **WHEN** `change.specDependsOn` changes the emitted specs or metadata freshness changes emitted warnings
- **THEN** the fingerprint changes

#### Scenario: Fingerprint changes when result-shaping flags change emitted context

- **GIVEN** a compiled context requested without dependency traversal or section filters
- **WHEN** `CompileContext.execute` is called again with flags that change emitted context, such as `followDeps`, `depth`, or `sections`
- **THEN** the fingerprint changes

#### Scenario: Format does not affect fingerprint

- **GIVEN** the fingerprint was calculated from a call whose compiled logical context matches the current context
- **WHEN** the same context is requested through `text`, `json`, or `toon`
- **THEN** the fingerprint remains unchanged

### Requirement: Structured result assembly

#### Scenario: Structured result contains only project and spec context components

- **WHEN** `CompileContext.execute` is called
- **THEN** the result contains project context entries, spec entries, and context warnings
- **AND** it does not contain a workflow-step availability collection

#### Scenario: List-mode structured entry omits summary and content fields

- **GIVEN** `contextMode: "list"`
- **WHEN** `CompileContext.execute` is called
- **THEN** each list entry includes `specId`, `source`, and `mode`
- **AND** list entries omit full content

#### Scenario: Summary-mode structured entry omits content

- **GIVEN** `contextMode: "summary"`
- **WHEN** `CompileContext.execute` is called
- **THEN** each summary entry omits full content

#### Scenario: Full-mode structured entry includes content

- **GIVEN** `contextMode: "full"`
- **WHEN** `CompileContext.execute` is called
- **THEN** each full entry includes content

### Requirement: Ports and constructor

#### Scenario: CompileContext is constructed without LifecycleEngine

- **WHEN** `CompileContext` is assembled from a resolved `SpecdConfig`
- **THEN** it receives its context repositories, parsers, hasher, preview use case, and default configuration snapshot
- **AND** it does not receive `LifecycleEngine`

#### Scenario: Construction preserves context dependencies

- **WHEN** `CompileContext` is assembled after lifecycle projections are removed
- **THEN** it retains the dependencies required to collect, render, and fingerprint context

### Requirement: Input

#### Scenario: Input accepts runtime overrides without config

- **WHEN** `CompileContext.execute` is called
- **THEN** it accepts the change name, target step, and optional runtime overrides such as `contextMode`, `llmOptimizedContext`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, and `fingerprint`
- **AND** it does not accept a `config` field

#### Scenario: Runtime contextMode overrides baked default

- **GIVEN** `CompileContext` was constructed with `contextMode: 'summary'` in its default snapshot
- **WHEN** `execute` is called with `contextMode: 'full'`
- **THEN** specs are rendered using full mode

### Requirement: Baked default configuration merge

#### Scenario: Yaml-derived fields come from construction default

- **GIVEN** `CompileContext` was constructed with project-level include patterns in its default snapshot
- **WHEN** `execute` is called without `contextMode` or `llmOptimizedContext` overrides
- **THEN** context collection uses the baked include/exclude patterns and yaml `contextMode`

#### Scenario: llmOptimizedContext runtime override wins over baked default

- **GIVEN** the baked default has `llmOptimizedContext: false`
- **WHEN** `execute` is called with `llmOptimizedContext: true`
- **THEN** optimized context is preferred when available

### Requirement: Caller-owned implementation tracking refresh

#### Scenario: CompileContext does not invoke detector

- **GIVEN** a change has entered `implementing` at least once
- **WHEN** `CompileContext.execute()` runs
- **THEN** it does not invoke `ImplementationDetector`
- **AND** it does not merge detected files before assembling context

### Requirement: Schema name guard

#### Scenario: Schema mismatch throws before context compilation

- **GIVEN** the change was created under a different schema name
- **WHEN** `CompileContext.execute` is called
- **THEN** it throws `SchemaMismatchError` before collecting context

### Requirement: Workspace resolution for spec IDs

#### Scenario: Unqualified include pattern resolves to default workspace

- **GIVEN** a project-level include pattern with no workspace qualifier
- **WHEN** `CompileContext.execute` resolves that pattern
- **THEN** it treats the pattern as targeting the `default` workspace

### Requirement: Result shape

#### Scenario: Result contains context entries and warnings without lifecycle projections

- **WHEN** `CompileContext.execute` returns a changed result
- **THEN** the payload includes `contextFingerprint`, `status`, `projectContext`, `specs`, and `warnings`
- **AND** it does not include `stepAvailable`, `blockingArtifacts`, or `availableSteps`

#### Scenario: Spec with validated delta returns merged content

- **GIVEN** a change with `specIds: ["core:config"]` and a validated delta for `spec.md`
- **AND** `PreviewSpec` returns a `files` entry with `filename: "spec.md"` and `merged: "merged content"`
- **WHEN** `CompileContext.execute` renders content for `core:config` in full mode
- **THEN** the `ContextSpecEntry.content` equals `"merged content"`

#### Scenario: Spec with no delta falls back to base content

- **GIVEN** a change with `specIds: ["core:config"]` and no delta files
- **AND** `PreviewSpec` returns an empty `files` array
- **WHEN** `CompileContext.execute` renders content for `core:config` in full mode
- **THEN** the `ContextSpecEntry.content` is rendered from metadata or extraction fallback as before

#### Scenario: PreviewSpec failure falls back gracefully

- **GIVEN** a change with `specIds: ["core:config"]` and a delta file
- **AND** `PreviewSpec` throws an error during execution
- **WHEN** `CompileContext.execute` renders content for `core:config`
- **THEN** the `ContextSpecEntry.content` is rendered from metadata or extraction fallback
- **AND** a warning is added to the result

#### Scenario: Preview only applies to specIds specs

- **GIVEN** a change with `specIds: ["core:config"]`
- **AND** the context includes `default:_global/architecture` via include pattern
- **WHEN** `CompileContext.execute` is called
- **THEN** `PreviewSpec` is NOT called for `default:_global/architecture`
- **AND** `default:_global/architecture` content is rendered from its base (metadata or fallback)

#### Scenario: Non-full specs are not previewed

- **GIVEN** `contextMode: "summary"` and a spec matched only via include pattern
- **WHEN** `CompileContext.execute` is called
- **THEN** `PreviewSpec` is NOT called for that spec

### Requirement: Prefer LLM-optimized context

#### Scenario: Uses optimized context when available

- **GIVEN** `llmOptimizedContext: true`
- **AND** a spec has `optimizedContext: "Optimized"` and `context: ["Original"]`
- **WHEN** context is compiled
- **THEN** the rendered output for that spec contains "Optimized"

#### Scenario: Falls back to standard context when optimized is empty

- **GIVEN** `llmOptimizedContext: true`
- **AND** a spec has `optimizedContext: ""` or missing
- **WHEN** context is compiled
- **THEN** the rendered output for that spec uses the standard `context`

#### Scenario: Optimization bypassed when only rules requested

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** a spec has fresh optimized metadata
- **WHEN** context is compiled with `sections: ["rules"]`
- **THEN** it displays the raw rules instead of optimized context
- **AND** it emits no `stale-optimization` warnings

#### Scenario: Warnings suppressed when optimization is bypassed by section flags

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** a spec is missing optimized context
- **WHEN** context is compiled with `sections: ["rules"]`
- **THEN** it emits no `stale-optimization` warning for that spec

#### Scenario: Scenarios are appended to optimized context when both are requested

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** a spec has fresh optimized metadata AND scenarios
- **WHEN** context is compiled with `sections: ["rules", "constraints", "scenarios"]`
- **THEN** it displays the optimized content
- **AND** it appends the rendered scenarios

### Requirement: Optimization warning signal

#### Scenario: Emits warning for missing spec optimization

- **GIVEN** `llmOptimizedContext` is enabled
- **AND** a spec is missing optimized context
- **WHEN** context is compiled
- **THEN** it emits a `stale-optimization` warning
- **AND** the message mentions `specd-spec-context-optimizer`

### Requirement: Config-based factory delegates through resolveCompileContextDeps

#### Scenario: createCompileContext config form derives CompileContextDeps through resolveCompileContextDeps

- **WHEN** `createCompileContext(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `CompileContextDeps` through `resolveCompileContextDeps(resolver)`
- **AND** `resolveCompileContextDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `files: FileReader`
- `parsers: ArtifactParserRegistry`
- `hasher: ContentHasher`
- `previewSpec: PreviewSpec`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `defaultConfig: CompileContextConfig`
- **AND** it does not resolve `LifecycleEngine`
- **AND** the factory delegates to canonical `createCompileContext(deps)`

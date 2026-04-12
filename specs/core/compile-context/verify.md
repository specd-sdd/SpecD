# Verification: CompileContext

## Requirements

### Requirement: Context spec collection

#### Scenario: Project-level include applied regardless of active workspace

- **GIVEN** a project-level `contextIncludeSpecs` pattern that matches specs in multiple workspaces
- **WHEN** `CompileContext.execute` is called for a specific workspace
- **THEN** all specs matching the project-level pattern are included regardless of the active workspace

#### Scenario: Workspace-level include applied only for active workspace

- **GIVEN** `billing` workspace declares `contextIncludeSpecs: ['*']`
- **AND** the current change has no spec in the `billing` workspace
- **WHEN** `CompileContext.execute` is called
- **THEN** no `billing` specs are included via workspace-level patterns

#### Scenario: Project-level exclude removes spec before workspace patterns are applied

- **GIVEN** `contextIncludeSpecs: ['default:*']` and `contextExcludeSpecs: ['default:drafts/*']`
- **AND** `default:drafts/old-spec` was matched by the project-level include
- **WHEN** `CompileContext.execute` applies step 2 (project-level exclude)
- **THEN** `default:drafts/old-spec` is removed before workspace-level patterns are evaluated

#### Scenario: Workspace-level exclude removes spec after workspace include

- **GIVEN** `default` workspace declares `contextIncludeSpecs: ['*']` and `contextExcludeSpecs: ['internal/*']`
- **AND** `default` is active and `default:internal/notes` was added by the workspace include (step 3)
- **WHEN** `CompileContext.execute` applies step 4 (workspace-level exclude)
- **THEN** `default:internal/notes` is removed from the context set

#### Scenario: change specId survives matching exclude rules

- **GIVEN** `change.specIds: ['default:auth/login']`
- **AND** project-level or workspace-level exclude patterns also match `default:auth/login`
- **WHEN** `CompileContext.execute` applies the collection pipeline
- **THEN** `default:auth/login` remains in the collected set because change-scoped spec IDs are mandatory context members

#### Scenario: specDependsOn value is seeded even without pattern matches

- **GIVEN** `change.specDependsOn: { 'default:auth/login': ['default:auth/shared'] }`
- **AND** `default:auth/shared` is not matched by any include pattern
- **WHEN** `CompileContext.execute` is called without `followDeps`
- **THEN** `default:auth/shared` is still included in the collected set as a seeded `specDependsOn` entry

#### Scenario: dependsOn traversal adds specs beyond include set

- **GIVEN** `change.specIds: ['default:auth/login']`
- **AND** `auth/login` metadata declares `dependsOn: ['auth/jwt']`
- **AND** `auth/jwt` was not matched by any include pattern
- **WHEN** `CompileContext.execute` applies step 5 with `followDeps: true`
- **THEN** `auth/jwt` is added to the context set

#### Scenario: dependsOn spec not removed by exclude

- **GIVEN** `contextExcludeSpecs: ['default:auth/*']`
- **AND** `auth/jwt` is added via `dependsOn` traversal (step 5)
- **WHEN** `CompileContext.execute` is called
- **THEN** `auth/jwt` is not excluded — `dependsOn` traversal specs are immune to exclude rules

#### Scenario: Spec appears only once even if seeded and matched multiple times

- **GIVEN** `change.specIds: ['default:auth/login']`
- **AND** `contextIncludeSpecs: ['auth/login', 'auth/*']` also matches `default:auth/login`
- **AND** `change.specDependsOn: { 'default:auth/login': ['default:auth/shared'] }`
- **AND** `default:auth/shared` is also discovered later via `dependsOn` traversal
- **WHEN** `CompileContext.execute` is called
- **THEN** each collected spec appears exactly once at the earliest qualifying position in the final `specs` array

### Requirement: Tier classification

#### Scenario: Lazy mode — specIds specs are tier 1 full

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** a spec appears in `change.specIds`
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted with `mode: 'full'`

#### Scenario: Lazy mode — specDependsOn specs are seeded but summary

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `change.specDependsOn: { 'default:auth/login': ['default:auth/shared'] }`
- **WHEN** `CompileContext.execute` is called
- **THEN** `default:auth/shared` is emitted with `source: 'specDependsOn'`
- **AND** `mode: 'summary'`

#### Scenario: Lazy mode — include pattern specs are tier 2 summary

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** a spec is matched only by include patterns
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted with `mode: 'summary'`

#### Scenario: Lazy mode — dependsOn traversal specs are tier 2 summary

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** a spec is discovered only through `dependsOn` traversal
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted with `mode: 'summary'`

#### Scenario: Full mode — all collected specs are tier 1 full

- **GIVEN** `config.contextMode: 'full'`
- **WHEN** `CompileContext.execute` is called
- **THEN** every collected spec is emitted with `mode: 'full'`

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

### Requirement: Step availability

#### Scenario: Step unavailable when required artifact not complete

- **GIVEN** `workflow.implementing.requires: ['tasks']`
- **AND** the `tasks` artifact's effective status is `in-progress`
- **WHEN** `CompileContext.execute` is called with `step: 'implementing'`
- **THEN** `result.stepAvailable` is `false`
- **AND** `result.blockingArtifacts` includes `'tasks'`

#### Scenario: Step available when all required artifacts are complete

- **GIVEN** `workflow.implementing.requires: ['tasks']`
- **AND** the `tasks` artifact's effective status is `complete`
- **WHEN** `CompileContext.execute` is called with `step: 'implementing'`
- **THEN** `result.stepAvailable` is `true`
- **AND** `result.blockingArtifacts` is empty

#### Scenario: Unavailability does not throw

- **GIVEN** the requested step's required artifacts are not complete
- **WHEN** `CompileContext.execute` is called
- **THEN** the result is returned normally — no exception is thrown

### Requirement: Structured result assembly

#### Scenario: instruction entry in projectContext array

- **GIVEN** `config.context: [{ instruction: "Always prefer editing existing files." }]`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.projectContext` contains an entry with `source: 'instruction'` and `content: "Always prefer editing existing files."`

#### Scenario: file entry read via FileReader into projectContext

- **GIVEN** `config.context: [{ file: "specd-bootstrap.md" }]`
- **AND** `FileReader.read("specd-bootstrap.md")` returns `"# specd Bootstrap"`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.projectContext` contains an entry with `source: 'file'`, `path: "specd-bootstrap.md"`, and `content: "# specd Bootstrap"`

#### Scenario: missing file entry emits a warning

- **GIVEN** `config.context: [{ file: "does-not-exist.md" }]`
- **AND** `FileReader.read("does-not-exist.md")` returns `null`
- **WHEN** `CompileContext.execute` is called
- **THEN** a warning is emitted identifying the missing file, the entry is absent from `projectContext`, and no error is thrown

#### Scenario: multiple context entries preserve declaration order

- **GIVEN** `config.context: [{ file: AGENTS.md }, { instruction: "Inline note." }, { file: specd-bootstrap.md }]`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.projectContext` contains entries in order: AGENTS.md file, instruction, specd-bootstrap.md file

#### Scenario: availableSteps includes all workflow steps

- **GIVEN** the schema declares workflow steps `['designing', 'ready', 'implementing', 'verifying', 'archiving']`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.availableSteps` contains an entry for each step with `available` and `blockingArtifacts`

#### Scenario: Specs preserve change-scoped seed ordering ahead of discovered context

- **GIVEN** `change.specIds: ['default:auth/login']`
- **AND** `change.specDependsOn: { 'default:auth/login': ['default:auth/shared'] }`
- **AND** include patterns add `default:_global/architecture`
- **AND** `dependsOn` traversal later discovers `default:auth/jwt`
- **WHEN** `CompileContext.execute` assembles `result.specs`
- **THEN** the entries appear in order: `default:auth/login`, `default:auth/shared`, `default:_global/architecture`, `default:auth/jwt`

#### Scenario: spec source priority — specIds wins over includePattern

- **GIVEN** `change.specIds: ['default:auth/login']`
- **AND** `contextIncludeSpecs: ['default:*']` also matches `default:auth/login`
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:auth/login` has `source: 'specIds'`, not `'includePattern'`

#### Scenario: spec source priority — specDependsOn wins over dependsOnTraversal

- **GIVEN** `change.specDependsOn: { 'default:auth/login': ['default:auth/shared'] }`
- **AND** `default:auth/shared` is also discovered via dependsOn metadata traversal
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:auth/shared` has `source: 'specDependsOn'`, not `'dependsOnTraversal'`

#### Scenario: No artifact instructions in the result

- **GIVEN** the schema declares `artifacts[spec].instruction: 'Create specifications...'`
- **WHEN** `CompileContext.execute` is called
- **THEN** the result does not include the artifact instruction — artifact instructions are retrieved via `GetArtifactInstruction`

#### Scenario: No instruction hooks in the result

- **GIVEN** `workflow.archiving.hooks.pre` contains `{ instruction: 'Review delta specs' }`
- **WHEN** `CompileContext.execute` is called with `step: 'archiving'`
- **THEN** the result does not include `Review delta specs` — instruction hooks are retrieved via `GetHookInstructions`

#### Scenario: metadataExtraction used as fallback for stale/absent metadata

- **GIVEN** a spec is in the context set with stale or absent metadata
- **AND** the schema declares `metadataExtraction` rules
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry's `content` is produced via extraction and a staleness warning is emitted

#### Scenario: Full rendering shows all spec-scoped artifacts in stable order

- **GIVEN** a full-mode spec has spec-scoped artifacts `verify.md`, `spec.md`, and `examples.md`
- **WHEN** `CompileContext.execute` is called without `sections`
- **THEN** the rendered `content` includes all three files
- **AND** `spec.md` appears first
- **AND** the remaining files appear in alphabetical order

#### Scenario: Full rendering does not depend on spec.md existing

- **GIVEN** a full-mode spec has spec-scoped artifacts `verify.md` and `examples.md` but no `spec.md`
- **WHEN** `CompileContext.execute` is called without `sections`
- **THEN** the rendered `content` includes both files
- **AND** they appear in alphabetical order

#### Scenario: Merged preview content uses the same file ordering

- **GIVEN** a spec in `change.specIds` has merged preview files from `PreviewSpec`
- **AND** those files include `verify.md`, `spec.md`, and `examples.md`
- **WHEN** `CompileContext.execute` is called without `sections`
- **THEN** the rendered merged `content` includes all preview files
- **AND** `spec.md` appears first
- **AND** the remaining merged files appear in alphabetical order

#### Scenario: Section filtering on merged preview derives content from merged artifacts

- **GIVEN** a spec in `change.specIds` has merged preview artifacts whose merged `verify.md` adds a new scenario
- **AND** `CompileContext.execute` is called with `sections: ['scenarios']`
- **WHEN** the full spec entry is rendered
- **THEN** the rendered `content` includes the scenario extracted from the merged preview artifacts
- **AND** it does not fall back to a raw single-file preview body

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
- **THEN** the fallback extraction fails explicitly instead of treating the spec as having no dependencies

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

#### Scenario: Fingerprint calculated from the compiled result

- **GIVEN** a change with project context entries, collected specs, available steps, and warnings
- **WHEN** `CompileContext.execute` is called without a fingerprint
- **THEN** a fingerprint is calculated from the canonicalized compiled context result and included in the response

#### Scenario: Unchanged status returned when fingerprint matches

- **GIVEN** the current compiled context fingerprint is `sha256:abc123...`
- **WHEN** `CompileContext.execute` is called with `fingerprint: 'sha256:abc123...'`
- **THEN** the result `status` is `'unchanged'`
- **AND** `projectContext` and `specs` are empty arrays
- **AND** the full context is not re-emitted

#### Scenario: Changed status returned when fingerprint does not match

- **GIVEN** the current compiled context fingerprint is `sha256:xyz789...`
- **WHEN** `CompileContext.execute` is called with `fingerprint: 'sha256:abc123...'`
- **THEN** the result `status` is `'changed'`
- **AND** the full context is assembled and returned
- **AND** `contextFingerprint` is `sha256:xyz789...`

#### Scenario: Fingerprint changes when specDependsOn changes emitted specs

- **GIVEN** a change initially emits no seeded `specDependsOn` specs
- **WHEN** `change.specDependsOn` is updated so the compiled `specs` array gains a new emitted entry
- **THEN** the fingerprint changes because the compiled output changed

#### Scenario: Fingerprint changes when warnings change

- **GIVEN** a compiled context with fresh metadata emits no warnings
- **WHEN** metadata becomes stale and the same context emits a warning
- **THEN** the fingerprint changes because the emitted result changed

#### Scenario: Fingerprint changes when step availability changes

- **GIVEN** a compiled context where the requested step is available
- **WHEN** a required artifact becomes incomplete and `stepAvailable` plus `blockingArtifacts` change
- **THEN** the fingerprint changes because the emitted availability result changed

#### Scenario: Fingerprint changes when result-shaping flags change emitted context

- **GIVEN** a compiled context requested without dependency traversal or section filters
- **WHEN** `CompileContext.execute` is called again with flags that change the emitted result, such as `followDeps`, `depth`, or `sections`
- **THEN** the fingerprint changes because the compiled logical output changed

#### Scenario: --format flag does not affect fingerprint

- **GIVEN** the fingerprint was calculated from a call whose compiled logical output matches the current context
- **WHEN** the same context is requested through a different presentation format such as `text` or `json`
- **THEN** the fingerprint remains unchanged

### Requirement: Materialized delta view

#### Scenario: Spec with validated delta returns merged content

- **GIVEN** a change with `specIds: ["core:core/config"]` and a validated delta for `spec.md`
- **AND** `PreviewSpec` returns a `files` entry with `filename: "spec.md"` and `merged: "merged content"`
- **WHEN** `CompileContext.execute` renders content for `core:core/config` in full mode
- **THEN** the `ContextSpecEntry.content` equals `"merged content"`

#### Scenario: Spec with no delta falls back to base content

- **GIVEN** a change with `specIds: ["core:core/config"]` and no delta files
- **AND** `PreviewSpec` returns an empty `files` array
- **WHEN** `CompileContext.execute` renders content for `core:core/config` in full mode
- **THEN** the `ContextSpecEntry.content` is rendered from metadata or extraction fallback as before

#### Scenario: PreviewSpec failure falls back gracefully

- **GIVEN** a change with `specIds: ["core:core/config"]` and a delta file
- **AND** `PreviewSpec` throws an error during execution
- **WHEN** `CompileContext.execute` renders content for `core:core/config`
- **THEN** the `ContextSpecEntry.content` is rendered from metadata or extraction fallback
- **AND** a warning is added to the result

#### Scenario: Preview only applies to specIds specs

- **GIVEN** a change with `specIds: ["core:core/config"]`
- **AND** the context includes `default:_global/architecture` via include pattern
- **WHEN** `CompileContext.execute` is called
- **THEN** `PreviewSpec` is NOT called for `default:_global/architecture`
- **AND** `default:_global/architecture` content is rendered from its base (metadata or fallback)

#### Scenario: Summary-mode specs not previewed

- **GIVEN** `contextMode: 'lazy'` and a spec matched only via include pattern (tier 2 summary)
- **WHEN** `CompileContext.execute` is called
- **THEN** `PreviewSpec` is NOT called for that spec — summary specs have no content to merge

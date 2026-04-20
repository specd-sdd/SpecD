# Verification: CompileContext

## Requirements

### Requirement: Context spec collection

#### Scenario: includeChangeSpecs false skips direct change spec seed

- **GIVEN** a change with `specIds: ["core:core/config"]`
- **AND** `core:core/config` is not matched by include patterns and not discovered via traversal
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: false`
- **THEN** `core:core/config` is not included solely because it is in `change.specIds`

#### Scenario: includeChangeSpecs true keeps direct change spec even if excluded

- **GIVEN** a change with `specIds: ["core:core/config"]`
- **AND** an exclude pattern matches `core:core/config`
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: true`
- **THEN** `core:core/config` remains in the collected set as a mandatory direct seed

#### Scenario: includeChangeSpecs false allows reinjection through include patterns

- **GIVEN** a change with `specIds: ["core:core/config"]`
- **AND** project include patterns match `core:core/config`
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: false`
- **THEN** `core:core/config` is still included through include-pattern collection

#### Scenario: includeChangeSpecs false allows reinjection through traversal

- **GIVEN** a change with `specIds: ["core:core/config"]`
- **AND** another spec in traversal depends on `core:core/config`
- **WHEN** `CompileContext.execute` is called with `includeChangeSpecs: false` and `followDeps: true`
- **THEN** `core:core/config` is included through `dependsOn` traversal

### Requirement: Context display modes

#### Scenario: Summary mode is the default when contextMode is omitted

- **GIVEN** `contextMode` is not declared in config
- **WHEN** `CompileContext.execute` is called
- **THEN** collected specs are emitted in summary mode unless another mode is explicitly requested

#### Scenario: List mode emits list entries only

- **GIVEN** `contextMode: "list"`
- **WHEN** `CompileContext.execute` is called
- **THEN** every emitted spec entry has `mode: "list"`
- **AND** no emitted entry contains full content

#### Scenario: Summary mode emits summary entries only

- **GIVEN** `contextMode: "summary"`
- **WHEN** `CompileContext.execute` is called
- **THEN** every emitted spec entry has `mode: "summary"`
- **AND** no emitted entry contains full content

#### Scenario: Full mode emits full entries only

- **GIVEN** `contextMode: "full"`
- **WHEN** `CompileContext.execute` is called
- **THEN** every emitted spec entry has `mode: "full"`
- **AND** each emitted entry contains renderable content

#### Scenario: Hybrid mode renders direct change specs in full

- **GIVEN** `contextMode: "hybrid"`
- **AND** `includeChangeSpecs: true`
- **AND** a spec is in `change.specIds`
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted in full mode

#### Scenario: Hybrid mode renders non-direct specs as summary

- **GIVEN** `contextMode: "hybrid"`
- **AND** a spec is collected from include patterns or traversal and is not a direct included change spec
- **WHEN** `CompileContext.execute` is called
- **THEN** that spec is emitted in summary mode

#### Scenario: Section flags do not affect list and summary entries

- **GIVEN** `contextMode: "list"` or `contextMode: "summary"`
- **WHEN** `CompileContext.execute` is called with section filters
- **THEN** emitted entries remain list/summary shaped without full content blocks

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

#### Scenario: availableSteps includes all workflow steps

- **WHEN** `CompileContext.execute` is called
- **THEN** `availableSteps` includes all steps from the active schema workflow

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

#### Scenario: Non-full specs are not previewed

- **GIVEN** `contextMode: "summary"` and a spec matched only via include pattern
- **WHEN** `CompileContext.execute` is called
- **THEN** `PreviewSpec` is NOT called for that spec — non-full specs have no merged content to render

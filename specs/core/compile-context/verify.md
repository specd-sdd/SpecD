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

#### Scenario: Spec appears only once even if matched multiple times

- **GIVEN** `contextIncludeSpecs: ['auth/login', 'auth/*']`
- **WHEN** `CompileContext.execute` is called
- **THEN** `auth/login` appears exactly once in the context, at the position of the first matching pattern

### Requirement: Tier classification

#### Scenario: Lazy mode — specIds specs are tier 1 full

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `change.specIds: ['default:auth/login']`
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:auth/login` has `mode: 'full'` and `source: 'specIds'`
- **AND** its `content` field is present with full structured content

#### Scenario: Lazy mode — specDependsOn specs are tier 1 full

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `change.specDependsOn: { 'default:auth/login': ['default:auth/shared'] }`
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:auth/shared` has `mode: 'full'` and `source: 'specDependsOn'`
- **AND** its `content` field is present with full structured content

#### Scenario: Lazy mode — include pattern specs are tier 2 summary

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `contextIncludeSpecs: ['default:*']` matches `default:_global/architecture`
- **AND** `default:_global/architecture` is NOT in `change.specIds` or `change.specDependsOn`
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:_global/architecture` has `mode: 'summary'` and `source: 'includePattern'`
- **AND** its `content` field is absent
- **AND** `title` and `description` are present

#### Scenario: Lazy mode — dependsOn traversal specs are tier 2 summary

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `followDeps: true`
- **AND** a spec `default:auth/jwt` is discovered via dependsOn traversal
- **AND** `default:auth/jwt` is NOT in `change.specIds` or `change.specDependsOn`
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:auth/jwt` has `mode: 'summary'` and `source: 'dependsOnTraversal'`

#### Scenario: Lazy mode — spec in both specIds and include pattern is tier 1

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `change.specIds: ['default:auth/login']`
- **AND** `contextIncludeSpecs: ['default:*']` also matches `default:auth/login`
- **WHEN** `CompileContext.execute` is called
- **THEN** the spec entry for `default:auth/login` has `mode: 'full'` and `source: 'specIds'`
- **AND** it appears exactly once in the `specs` array

#### Scenario: Full mode — all specs are tier 1 full

- **GIVEN** `config.contextMode: 'full'`
- **AND** `contextIncludeSpecs: ['default:*']` matches multiple specs
- **WHEN** `CompileContext.execute` is called
- **THEN** all spec entries have `mode: 'full'`
- **AND** all spec entries have `content` present

#### Scenario: Default contextMode is lazy

- **GIVEN** `config.contextMode` is not set
- **AND** `change.specIds` contains some specs and `contextIncludeSpecs` matches others
- **WHEN** `CompileContext.execute` is called
- **THEN** specIds specs have `mode: 'full'` and other specs have `mode: 'summary'` — same as `contextMode: 'lazy'`

### Requirement: Cycle detection during dependsOn traversal

#### Scenario: Cycle broken without infinite loop

- **GIVEN** `auth/login` depends on `auth/jwt` and `auth/jwt` depends back on `auth/login`
- **WHEN** `CompileContext.execute` traverses `dependsOn`
- **THEN** both specs are included (or the cycle is broken at one point)
- **AND** no infinite loop occurs
- **AND** a cycle warning is emitted

### Requirement: Staleness warning

#### Scenario: Stale metadata emits warning

- **GIVEN** `auth/jwt` metadata has `contentHashes.spec.md: 'sha256:old'`
- **AND** the current `spec.md` hashes to `sha256:new`
- **WHEN** `CompileContext.execute` adds `auth/jwt` via `dependsOn` traversal
- **THEN** the result `warnings` includes a staleness warning for `auth/jwt`

#### Scenario: Fresh metadata emits no staleness warning

- **GIVEN** all `contentHashes` in metadata match the current file hashes
- **WHEN** `CompileContext.execute` is called
- **THEN** no staleness warnings are emitted

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

#### Scenario: Fallback to content extraction when metadata absent in dependsOn traversal

- **GIVEN** the schema declares `metadataExtraction.dependsOn`
- **AND** a spec in the `dependsOn` traversal has no metadata
- **AND** the spec's artifact content contains extractable dependency references
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** dependencies are extracted from the spec content via the `metadataExtraction` engine
- **AND** a `missing-metadata` warning is still emitted

#### Scenario: Manifest specDependsOn used as primary source for dependencies

- **GIVEN** `change.specDependsOn` has an entry for `auth/login` with `['auth/shared']`
- **AND** `auth/login` metadata declares `dependsOn: ['auth/jwt']`
- **WHEN** `CompileContext.execute` is called with `followDeps: true`
- **THEN** `auth/shared` is used as the dependency (from manifest), not `auth/jwt` (from metadata)

### Requirement: Unknown workspace qualifiers emit a warning

#### Scenario: Unknown workspace qualifier in include pattern

- **GIVEN** `contextIncludeSpecs: ['unknown-workspace:*']`
- **AND** `unknown-workspace` is not declared in the active config
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.warnings` includes a warning about the unknown qualifier
- **AND** no exception is thrown

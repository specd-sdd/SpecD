# Verification: CompileContext

## Requirements

### Requirement: Context spec collection

#### Scenario: Project-level include applied regardless of active workspace

- **GIVEN** `contextIncludeSpecs: ['_global/*']` at the project level
- **AND** the current change has no spec from `_global`
- **WHEN** `CompileContext.execute` is called
- **THEN** all specs under `_global/` are included in the context

#### Scenario: Workspace-level include applied only for active workspace

- **GIVEN** `billing` workspace declares `contextIncludeSpecs: ['*']`
- **AND** the current change has no spec in the `billing` workspace
- **WHEN** `CompileContext.execute` is called
- **THEN** no `billing` specs are included via workspace-level patterns

#### Scenario: Project-level exclude removes spec before workspace patterns are applied

- **GIVEN** `contextIncludeSpecs: ['default:*']` and `contextExcludeSpecs: ['default:drafts/*']`
- **AND** `default:drafts/old-spec` was matched by the project-level include
- **WHEN** `CompileContext.execute` applies step 3 (project-level exclude)
- **THEN** `default:drafts/old-spec` is removed before workspace-level patterns are evaluated

#### Scenario: Workspace-level exclude removes spec after workspace include

- **GIVEN** `default` workspace declares `contextIncludeSpecs: ['*']` and `contextExcludeSpecs: ['internal/*']`
- **AND** `default` is active and `default:internal/notes` was added by the workspace include (step 4)
- **WHEN** `CompileContext.execute` applies step 5 (workspace-level exclude)
- **THEN** `default:internal/notes` is removed from the context set

#### Scenario: dependsOn traversal adds specs beyond include set

- **GIVEN** `change.contextSpecIds: ['auth/login']`
- **AND** `auth/login/.specd-metadata.yaml` declares `dependsOn: ['auth/jwt']`
- **AND** `auth/jwt` was not matched by any include pattern
- **WHEN** `CompileContext.execute` applies step 6
- **THEN** `auth/jwt` is added to the context set

#### Scenario: dependsOn spec not removed by exclude

- **GIVEN** `contextExcludeSpecs: ['default:auth/*']`
- **AND** `auth/jwt` is added via `dependsOn` traversal (step 6)
- **WHEN** `CompileContext.execute` is called
- **THEN** `auth/jwt` is not excluded — `dependsOn` traversal specs are immune to exclude rules

#### Scenario: Spec appears only once even if matched multiple times

- **GIVEN** `contextIncludeSpecs: ['auth/login', 'auth/*']`
- **WHEN** `CompileContext.execute` is called
- **THEN** `auth/login` appears exactly once in the context, at the position of the first matching pattern

### Requirement: Cycle detection during dependsOn traversal

#### Scenario: Cycle broken without infinite loop

- **GIVEN** `auth/login` depends on `auth/jwt` and `auth/jwt` depends back on `auth/login`
- **WHEN** `CompileContext.execute` traverses `dependsOn`
- **THEN** both specs are included (or the cycle is broken at one point)
- **AND** no infinite loop occurs
- **AND** a cycle warning is emitted

### Requirement: Staleness warning

#### Scenario: Stale metadata emits warning

- **GIVEN** `auth/jwt/.specd-metadata.yaml` has `contentHashes.spec.md: 'sha256:old'`
- **AND** the current `spec.md` hashes to `sha256:new`
- **WHEN** `CompileContext.execute` adds `auth/jwt` via `dependsOn` traversal
- **THEN** the result `warnings` includes a staleness warning for `auth/jwt`

#### Scenario: Fresh metadata emits no staleness warning

- **GIVEN** all `contentHashes` in `.specd-metadata.yaml` match the current file hashes
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

### Requirement: Assembled instruction block

#### Scenario: instruction entry injected before schema instruction

- **GIVEN** `config.context: [{ instruction: "Always prefer editing existing files." }]`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.instructionBlock` begins with `"Always prefer editing existing files."`
- **AND** that text appears before the schema instruction

#### Scenario: file entry read via FileReader and injected verbatim before schema instruction

- **GIVEN** `config.context: [{ file: "specd-bootstrap.md" }]`
- **AND** `FileReader.read("specd-bootstrap.md")` returns `"# specd Bootstrap"`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.instructionBlock` begins with `"# specd Bootstrap"`
- **AND** that content appears before the schema instruction

#### Scenario: missing file entry emits a warning

- **GIVEN** `config.context: [{ file: "does-not-exist.md" }]`
- **AND** `FileReader.read("does-not-exist.md")` returns `null`
- **WHEN** `CompileContext.execute` is called
- **THEN** a warning is emitted identifying the missing file, the entry is absent from the output, and no error is thrown

#### Scenario: context absent — no effect on instruction block

- **GIVEN** `config.context` is not declared
- **WHEN** `CompileContext.execute` is called
- **THEN** the instruction block is identical to one produced with `context: []`

#### Scenario: multiple context entries preserve declaration order

- **GIVEN** `config.context: [{ file: AGENTS.md }, { instruction: "Inline note." }, { file: specd-bootstrap.md }]`
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.instructionBlock` contains `AGENTS.md` content first, then `"Inline note."`, then `specd-bootstrap.md` content — in declaration order, before schema instruction

#### Scenario: Schema instruction included for the active artifact only

- **GIVEN** the schema declares `artifacts[spec].instruction: 'Create specifications...'` and `artifacts[verify].instruction: 'Write scenarios...'`
- **AND** `CompileContext.execute` is called with `activeArtifact: 'spec'`
- **THEN** `result.instructionBlock` includes the instruction for `spec`
- **AND** does not include the instruction for `verify`

#### Scenario: No artifact instruction for post-ready steps

- **GIVEN** `CompileContext.execute` is called for a post-`ready` step (e.g. `implementing`, `verifying`, `archiving`)
- **AND** no `activeArtifact` is provided
- **THEN** no artifact instructions are included in the instruction block — artifacts already exist at this point

#### Scenario: artifactRules injected for the active artifact only

- **GIVEN** `artifactRules.spec: ['All requirements must use SHALL/MUST']` and `artifactRules.verify: ['Scenarios must use GIVEN/WHEN/THEN']`
- **AND** `CompileContext.execute` is called with `activeArtifact: 'spec'`
- **THEN** `result.instructionBlock` includes the `spec` rules after the schema instruction
- **AND** does not include the `verify` rules
- **AND** the schema instruction is not replaced

#### Scenario: Step hooks fire once regardless of artifact iteration

- **GIVEN** the `designing` step declares `hooks.pre: [{ instruction: 'Plan your approach first.' }]`
- **AND** `CompileContext.execute` is called twice — once with `activeArtifact: 'spec'` and once with `activeArtifact: 'tasks'`
- **THEN** both calls include the `designing` pre-hook instruction — hooks are part of the step context, not scoped to a specific artifact

#### Scenario: metadataExtraction used as fallback for stale/absent metadata

- **GIVEN** the schema declares `metadataExtraction.rules: [{ artifact: specs, extractor: { selector: { type: section, matches: '^Requirements$' }, groupBy: label, extract: content } }]`
- **AND** `auth/jwt/spec.md` is in the context set and has a `## Requirements` section
- **WHEN** `CompileContext.execute` is called with stale or absent metadata for `auth/jwt`
- **THEN** `result.instructionBlock` includes extracted rules content from `auth/jwt/spec.md`

#### Scenario: metadataExtraction extractor matching no nodes silently skipped

- **GIVEN** the schema declares a `metadataExtraction` extractor with a selector matching `'^Examples$'`
- **AND** a context spec has no section matching `Examples`
- **WHEN** `CompileContext.execute` is called
- **THEN** no error is thrown and no content is produced for that field

#### Scenario: instruction hooks included but run hooks excluded

- **GIVEN** `workflow.archiving.hooks.pre` contains `{ instruction: 'Review delta specs' }` and `{ run: 'pnpm test' }`
- **WHEN** `CompileContext.execute` is called with `step: 'archiving'`
- **THEN** `result.instructionBlock` includes `Review delta specs`
- **AND** `pnpm test` is not included in the instruction block

### Requirement: Missing spec IDs emit a warning

#### Scenario: Non-existent spec ID emits a warning

- **GIVEN** an include pattern matches a spec ID that does not exist in `SpecRepository`
- **WHEN** `CompileContext.execute` is called
- **THEN** a warning is emitted identifying the missing path, the path is skipped, and no error is thrown

### Requirement: Unknown workspace qualifiers emit a warning

#### Scenario: Unknown workspace qualifier in include pattern

- **GIVEN** `contextIncludeSpecs: ['unknown-workspace:*']`
- **AND** `unknown-workspace` is not declared in the active config
- **WHEN** `CompileContext.execute` is called
- **THEN** `result.warnings` includes a warning about the unknown qualifier
- **AND** no exception is thrown

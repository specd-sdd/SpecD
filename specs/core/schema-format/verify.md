# Verification: Schema Format

## Requirements

### Requirement: Schema file structure

#### Scenario: Minimal valid schema

- **WHEN** a schema file contains `kind: schema`, `name`, `version`, and at least one artifact
- **THEN** `SchemaRegistry.resolve()` must return the parsed schema without error

#### Scenario: Missing required field

- **WHEN** a schema file is missing `name` or `version`
- **THEN** `SchemaRegistry.resolve()` must throw a validation error

### Requirement: Schema kind field

#### Scenario: Missing kind field

- **WHEN** a schema file omits the `kind` field
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Invalid kind value

- **WHEN** a schema file declares `kind: extension`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Plugin with artifacts is rejected

- **WHEN** a schema file declares `kind: schema-plugin` and also declares `artifacts`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Plugin with workflow is rejected

- **WHEN** a schema file declares `kind: schema-plugin` and also declares `workflow`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: Schema extends

#### Scenario: Simple extends chain resolved

- **GIVEN** schema A declares `extends: '#child-schema'` and child-schema declares `extends: '#base-schema'`
- **WHEN** schema A is resolved
- **THEN** the resolution follows the chain: base-schema → child-schema → A, with each layer applied in order

#### Scenario: Extends cycle detected

- **GIVEN** schema A declares `extends: '#b'` and schema B declares `extends: '#a'`
- **WHEN** schema A is resolved
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` identifying the cycle

#### Scenario: Plugin with extends is rejected

- **WHEN** a schema file declares `kind: schema-plugin` and also declares `extends: '#base'`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Extends references a non-existent schema

- **WHEN** a schema declares `extends: '#nonexistent'` and no such schema exists
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaNotFoundError`

### Requirement: Array entry identity

#### Scenario: Same id in different arrays is valid

- **WHEN** `workflow[0].hooks.pre` has `id: run-tests` and `workflow[1].rules.pre` also has `id: run-tests`
- **THEN** the schema loads without error — rules use per-array uniqueness, not global

#### Scenario: Duplicate hook IDs across workflow steps rejected

- **WHEN** `workflow[0].hooks.pre` has `id: run-lint` and `workflow[1].hooks.post` also has `id: run-lint`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate hook ID

#### Scenario: Duplicate validation IDs within same artifact rejected

- **WHEN** an artifact has `validations: [{ id: "req-1", ... }, { id: "req-1", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate validation ID

#### Scenario: Duplicate deltaValidation IDs within same artifact rejected

- **WHEN** an artifact has `deltaValidations: [{ id: "has-scenario", ... }, { id: "has-scenario", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate deltaValidation ID

#### Scenario: Duplicate rules.pre IDs within same artifact rejected

- **WHEN** an artifact has `rules.pre: [{ id: "normative", ... }, { id: "normative", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate rules.pre ID

#### Scenario: Duplicate rules.post IDs within same artifact rejected

- **WHEN** an artifact has `rules.post: [{ id: "format", ... }, { id: "format", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate rules.post ID

#### Scenario: Duplicate preHashCleanup IDs within same artifact rejected

- **WHEN** an artifact has `preHashCleanup: [{ id: "checkboxes", ... }, { id: "checkboxes", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate preHashCleanup ID

#### Scenario: Duplicate metadataExtraction.context IDs rejected

- **WHEN** metadata extraction has `context: [{ id: "ctx-1", ... }, { id: "ctx-1", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate context ID

#### Scenario: Duplicate metadataExtraction.rules IDs rejected

- **WHEN** metadata extraction has `rules: [{ id: "rule-1", ... }, { id: "rule-1", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate rules ID

#### Scenario: Duplicate metadataExtraction.constraints IDs rejected

- **WHEN** metadata extraction has `constraints: [{ id: "constraint-1", ... }, { id: "constraint-1", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate constraints ID

#### Scenario: Duplicate metadataExtraction.scenarios IDs rejected

- **WHEN** metadata extraction has `scenarios: [{ id: "scenario-1", ... }, { id: "scenario-1", ... }]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` mentioning the duplicate scenarios ID

### Requirement: Artifact definition

#### Scenario: Filename derived from glob literal segment

- **WHEN** an artifact declares `output: "specs/**/spec.md"` and a new file is created within the change
- **THEN** the file is named `spec.md`; the subdirectory path (e.g. `auth/login/`) is chosen by the user

#### Scenario: Filename derived from template when glob segment is a wildcard

- **WHEN** an artifact declares `output: "specs/**/*.md"` and `template: "templates/spec.md"`
- **THEN** the file is named `spec.md`, taken from the template filename

#### Scenario: Filename indeterminate — no literal segment and no template

- **WHEN** an artifact declares `output: "specs/**/*.md"` and omits `template`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` identifying the artifact

#### Scenario: Artifact with no requirements

- **WHEN** an artifact omits `requires`
- **THEN** its effective status depends only on its own validated hash

#### Scenario: Artifact with dependency chain

- **WHEN** artifact B declares `requires: [a]` and artifact A is `in-progress`
- **THEN** `Change.effectiveStatus('b')` must return `in-progress`

#### Scenario: Circular dependency in artifact graph

- **WHEN** artifact A declares `requires: [b]` and artifact B declares `requires: [a]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` identifying the cycle

#### Scenario: Non-optional artifact requires optional artifact

- **WHEN** artifact A is `optional: true` and artifact B is `optional: false` and declares `requires: [a]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Optional artifact requiring optional artifact is valid

- **WHEN** artifact A is `optional: true` and artifact B is also `optional: true` and declares `requires: [a]`
- **THEN** `SchemaRegistry.resolve()` loads successfully

#### Scenario: deltaValidations on non-delta artifact

- **WHEN** an artifact declares `delta: false` and also declares `deltaValidations`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: Delta validation rules

#### Scenario: where rule matches correlated entry in delta AST

- **GIVEN** a `deltaValidations` rule `{ type: sequence-item, where: { op: 'added|modified' }, contentMatches: '#### Scenario:', required: true }`
- **AND** the delta file contains at least one entry with `op: added` whose `content` includes `#### Scenario:`
- **WHEN** `ValidateArtifacts` evaluates the rule against the normalized delta YAML AST
- **THEN** the rule passes — at least one matching node was found

#### Scenario: where rule fails when no entry matches correlated condition

- **GIVEN** a `deltaValidations` rule `{ type: sequence-item, where: { op: 'added|modified' }, contentMatches: '#### Scenario:', required: true }`
- **AND** the delta file contains only entries with `op: removed`
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** the rule fails — zero nodes matched — and `ValidateArtifacts` reports a validation failure

#### Scenario: Rule passes vacuously when no nodes match

- **GIVEN** a `deltaValidations` rule that matches no nodes in the delta YAML AST
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** the rule passes without error regardless of `required`

#### Scenario: Warning on required false with no match

- **GIVEN** a `deltaValidations` rule with `required: false` that matches zero nodes in the delta YAML AST
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** `ValidateArtifacts` records a warning, not a failure

#### Scenario: Children constraint checked for each matched node

- **GIVEN** a `deltaValidations` rule that matches two nodes, and a `children` constraint that matches zero nodes relative to one of those matched nodes
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** the failing child check produces a validation failure for that matched node

#### Scenario: delta on scope:change artifact

- **WHEN** an artifact declares `delta: true` and `scope: change`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: format inferred from output extension

- **WHEN** an artifact omits `format` and its derived output filename ends in `.md`
- **THEN** the resolved artifact has `format: markdown`

#### Scenario: format indeterminate requires explicit declaration

- **WHEN** an artifact omits `format` and its derived output filename has an extension not in `.md`, `.json`, `.yaml`, `.yml`
- **THEN** the resolved artifact uses `format: plaintext`

### Requirement: Template resolution

#### Scenario: Template loaded at resolve time

- **WHEN** an artifact declares `template: templates/proposal.md` and the file exists in the schema directory
- **THEN** `SchemaRegistry.resolve()` returns the artifact with the template content populated

#### Scenario: Template file not found

- **WHEN** an artifact declares a `template` path that does not exist relative to the schema directory
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: No template declared

- **WHEN** an artifact omits `template`
- **THEN** no template content is provided for that artifact; scaffolding falls back to an empty file

### Requirement: Validation rules

#### Scenario: Required section missing

- **GIVEN** a `validations` rule `{ type: section, matches: '^Requirements$', required: true }`
- **AND** the artifact has no section whose label matches `Requirements`
- **WHEN** `ValidateArtifacts` evaluates the rule against the normalized artifact AST
- **THEN** `ValidateArtifacts` reports an error

#### Scenario: Required section missing — warning

- **GIVEN** a `validations` rule with `required: false` that matches no node in the artifact AST
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** `ValidateArtifacts` reports a warning, not an error

#### Scenario: children narrows scope to matched node

- **GIVEN** a `validations` rule `{ type: section, matches: '^Requirements$', children: [{ type: section, matches: '^Requirement:' }] }`
- **AND** a `Requirement:` section exists both inside `Requirements` and outside it
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** only the `Requirement:` section inside `Requirements` is checked against the child rule; the outer one is not

#### Scenario: Children constraint fails on one node

- **GIVEN** a `validations` rule `{ type: section, matches: '^Requirement:' }` with a `children` constraint `{ type: section, matches: '^Scenario:', required: true }`
- **AND** one `Requirement:` section has no `Scenario:` child
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** `ValidateArtifacts` reports an error identifying the offending Requirement

#### Scenario: contentMatches checked against serialized subtree

- **GIVEN** a `validations` rule `{ type: section, matches: '^Requirement:', contentMatches: 'SHALL|MUST', required: false }`
- **AND** one `Requirement:` section whose serialized markdown body contains no `SHALL` or `MUST`
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** `ValidateArtifacts` records a warning for that section

#### Scenario: Rule passes vacuously when no nodes match

- **GIVEN** a `validations` rule with a `children` constraint, whose top-level identification matches zero nodes in the artifact AST
- **WHEN** `ValidateArtifacts` evaluates the rule
- **THEN** the rule passes without error — the children constraint is never evaluated

### Requirement: Per-spec approval

#### Scenario: New spec requires approval

- **WHEN** a delta creates a new spec via an `added` operation
- **THEN** that spec ID must be approved before archiving

#### Scenario: Modified spec requires approval

- **WHEN** a delta modifies or removes nodes in an existing spec
- **THEN** that spec ID must be approved before archiving

#### Scenario: All specs approved

- **WHEN** every spec ID touched by the change has been approved
- **THEN** `specd archive` proceeds without an approval error

#### Scenario: Partially approved

- **WHEN** at least one touched spec ID has not been approved
- **THEN** `specd archive` must refuse and report which spec IDs are pending approval

### Requirement: taskCompletionCheck

#### Scenario: Default patterns detect markdown checkboxes

- **GIVEN** an artifact with no `taskCompletionCheck` declared
- **AND** its file contains `- [ ] pending` and `- [x] done`
- **WHEN** the CLI checks task completion
- **THEN** `incompletePattern` defaults to `^\s*-\s+\[ \]` and matches `- [ ] pending`
- **AND** `completePattern` defaults to `^\s*-\s+\[x\]` (case-insensitive) and matches `- [x] done`

#### Scenario: Custom patterns override defaults

- **GIVEN** an artifact declares `taskCompletionCheck.incompletePattern: '^\s*TODO:'` and `taskCompletionCheck.completePattern: '^\s*DONE:'`
- **AND** its file contains `TODO: implement login` and `DONE: implement logout`
- **WHEN** the CLI checks task completion
- **THEN** `incompletePattern` matches `TODO: implement login` and the transition is blocked

#### Scenario: All tasks complete — no incomplete matches

- **GIVEN** an artifact file where all checkboxes are checked and none are unchecked
- **WHEN** the `implementing → verifying` transition is attempted
- **THEN** `incompletePattern` matches zero lines and the transition is allowed

### Requirement: preHashCleanup

#### Scenario: Substitution applied before hashing

- **GIVEN** an artifact with `preHashCleanup: [{ pattern: '^\s*-\s+\[x\]', replacement: '- [ ]' }]`
- **AND** its file contains `- [x] implement logout`
- **WHEN** the hash is computed
- **THEN** the substitution is applied first and the hash reflects the normalised content

#### Scenario: Checking a task off does not invalidate approval

- **GIVEN** an artifact with `preHashCleanup` that normalises checked boxes to unchecked
- **AND** the artifact was approved with some tasks unchecked
- **WHEN** tasks are marked complete
- **THEN** the approval hash still matches

#### Scenario: Multiple substitutions applied in order

- **GIVEN** an artifact with two `preHashCleanup` entries
- **WHEN** the hash is computed
- **THEN** the first substitution is applied to the full content, then the second is applied to the result of the first

### Requirement: Metadata extraction

#### Scenario: Extraction declared and metadata absent

- **GIVEN** the schema declares a `metadataExtraction` block with extractors for `rules` and `constraints`
- **AND** a spec in the context set has no `.specd-metadata.yaml`
- **WHEN** `CompileContext` or `GetProjectContext` processes that spec
- **THEN** the extraction engine runs the declared extractors against parsed artifact ASTs
- **AND** the extracted content is included in the compiled context

#### Scenario: Extractor transform shorthand accepted

- **GIVEN** a metadata extractor declares `transform: resolveSpecPath`
- **WHEN** `SchemaRegistry.resolve()` loads the schema
- **THEN** the schema is accepted and the transform declaration is preserved in the resolved extractor

#### Scenario: FieldMapping transform object with args accepted

- **GIVEN** a metadata extractor field mapping declares `transform: { name: "join", args: ["$2", "/", "$1"] }`
- **WHEN** `SchemaRegistry.resolve()` loads the schema
- **THEN** the schema is accepted and the transform declaration is preserved in the resolved field mapping

#### Scenario: Transform declarations do not imply silent omission semantics

- **GIVEN** a metadata extractor declares a transform on an extracted field
- **WHEN** the schema is resolved
- **THEN** the declaration means the runtime transform must either return a non-null normalized value or fail explicitly

#### Scenario: dependsOn extractor supports canonical labels with or without links

- **GIVEN** a metadata extractor for `dependsOn` captures a canonical dependency label as `value`
- **AND** the same capture also preserves an optional relative `href` as a transform arg when a link exists
- **WHEN** `SchemaRegistry.resolve()` loads the schema
- **THEN** the schema is accepted for both linked entries like ``[`core:core/config`](../config/spec.md)`` and unlinked entries like `` `core:core/config` ``

#### Scenario: GenerateSpecMetadata produces deterministic output

- **GIVEN** the schema declares `metadataExtraction` with extractors for title, rules, and constraints
- **WHEN** `GenerateSpecMetadata.execute` is called for a spec
- **THEN** the result contains extracted metadata with `generatedBy: 'core'` and computed `contentHashes`

### Requirement: Artifact scope

#### Scenario: Missing non-optional artifact in change

- **WHEN** a change is missing an artifact with `optional: false`
- **THEN** `ValidateArtifacts` must report a validation error

#### Scenario: Optional artifact absent from change

- **WHEN** a change is missing an artifact with `optional: true`
- **THEN** `ValidateArtifacts` does not report a validation error for that artifact

#### Scenario: Missing scope:spec artifact file in spec directory

- **WHEN** a spec directory at `specs/<name>/` is missing a file for a non-optional `scope: spec` artifact
- **THEN** `specd validate` must report that spec as incomplete

#### Scenario: scope:change artifact not present in spec directory

- **WHEN** a `scope: change` artifact is present in the change
- **THEN** it is validated but never synced to the spec directory

### Requirement: Workflow

#### Scenario: Pre hook failure aborts step

- **WHEN** a `pre` `run:` hook exits with a non-zero code
- **THEN** the step is aborted, the user is informed, and the agent offers to fix the problem before retrying

#### Scenario: Post hook failure prompts user

- **WHEN** a `post` `run:` hook exits with a non-zero code
- **THEN** the user is prompted to continue or stop; the completed step is not rolled back

#### Scenario: Step with unsatisfied prerequisites

- **WHEN** a step's `requires` lists an artifact that is not `complete`
- **THEN** `CompileContext` must report that the step is blocked

#### Scenario: Step blocked when required artifact deleted mid-lifecycle

- **GIVEN** a workflow step `implementing` with `requires: [proposal, specs, verify, design, tasks]`
- **AND** a change where `design` artifact has been deleted (status reverts to `missing`)
- **WHEN** `CompileContext` evaluates step availability for `implementing`
- **THEN** `stepAvailable` is `false`
- **AND** `blockingArtifacts` includes `"design"`

#### Scenario: Hook entries require id

- **WHEN** a `workflow[].hooks.pre` entry omits the `id` field
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: Explicit external hook entries

#### Scenario: External hook entry declares nested type and opaque config

- **GIVEN** a workflow hook entry with `id` and an `external` object containing `type` and `config`
- **WHEN** schema validation parses the workflow step
- **THEN** the entry is accepted as an explicit external hook entry
- **AND** it remains distinct from `instruction:` and shell `run:` entries

#### Scenario: Unknown external hook type is rejected

- **GIVEN** a workflow external hook entry whose type is absent from the merged external hook runner registry
- **WHEN** the workflow is resolved for execution
- **THEN** specd fails with a clear unknown external hook type error
- **AND** the hook is not treated as a no-op

### Requirement: Artifact definition

#### Scenario: preHashCleanup entry requires id

- **WHEN** a `preHashCleanup` entry omits the `id` field
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: Schema plugin kind

#### Scenario: Valid plugin with operations

- **GIVEN** a schema file with `kind: schema-plugin`, `name: my-plugin`, `version: 1`, and merge operations
- **WHEN** the plugin is resolved
- **THEN** it loads successfully

#### Scenario: Plugin with metadataExtraction is rejected

- **WHEN** a schema-plugin declares `metadataExtraction`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: Schema resolution

#### Scenario: npm package resolved

- **WHEN** `schema: "@specd/schema-std"` is declared
- **THEN** `SchemaRegistry.resolve()` loads `node_modules/@specd/schema-std/schema.yaml`

#### Scenario: Bare name resolved from default workspace

- **WHEN** `schema: "spec-driven"` is declared and `workspaces.default.schemas.fs.path` is `specd/schemas`
- **THEN** `SchemaRegistry.resolve()` loads `specd/schemas/spec-driven/schema.yaml`

#### Scenario: Direct path resolved

- **WHEN** `schema: "./custom/schema.yaml"` is declared
- **THEN** `SchemaRegistry.resolve()` loads that file relative to the `specd.yaml` directory

#### Scenario: Schema not found

- **WHEN** the resolved path does not exist on disk
- **THEN** `SchemaRegistry.resolve()` returns `null`

### Requirement: Schema validation on load

#### Scenario: Unknown field ignored

- **WHEN** a schema file includes a top-level field not in the current spec
- **THEN** the schema loads successfully and the unknown field is ignored

#### Scenario: Duplicate artifact ID

- **WHEN** a schema file declares two artifacts with the same `id`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Duplicate workflow step

- **WHEN** the `workflow` array contains two entries with the same `step` name
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Unknown artifact ID in requires

- **WHEN** an artifact declares `requires: [unknown-id]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: verify.md format

#### Scenario: verify.md compiled with spec.md

- **WHEN** specd compiles context for a spec that has both `spec` and `verify` artifacts with `scope: spec`
- **THEN** both `spec.md` and `verify.md` are read and included together in the LLM context

#### Scenario: Artifact with rules.pre and rules.post

- **GIVEN** an artifact declares `rules: { pre: [{ id: pre-rule, instruction: "Before instruction" }], post: [{ id: post-rule, instruction: "After instruction" }] }`
- **WHEN** `CompileContext` assembles the instruction block for that artifact
- **THEN** `pre-rule` instruction appears before the artifact's `instruction` and `post-rule` instruction appears after it

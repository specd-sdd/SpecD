# Verification: Schema Format

## Requirements

### Requirement: Schema file structure

#### Scenario: Minimal valid schema

- **WHEN** a schema file contains `name`, `version`, and at least one artifact
- **THEN** `SchemaRegistry.resolve()` must return the parsed schema without error

#### Scenario: Missing required field

- **WHEN** a schema file is missing `name` or `version`
- **THEN** `SchemaRegistry.resolve()` must throw a validation error

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
- **THEN** that spec path must be approved before archiving

#### Scenario: Modified spec requires approval

- **WHEN** a delta modifies or removes nodes in an existing spec
- **THEN** that spec path must be approved before archiving

#### Scenario: All specs approved

- **WHEN** every spec path touched by the change has been approved
- **THEN** `specd archive` proceeds without an approval error

#### Scenario: Partially approved

- **WHEN** at least one touched spec path has not been approved
- **THEN** `specd archive` must refuse and report which spec paths are pending approval

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

### Requirement: Context sections

#### Scenario: Section injected

- **WHEN** an artifact has a `contextSections` entry and the selector matches a node in the spec
- **THEN** `CompileContext` includes the extracted content in the compiled context under the given `contextTitle`, labelled with the declared `role`

#### Scenario: contextTitle omitted

- **WHEN** a `contextSections` entry has no `contextTitle`
- **THEN** `CompileContext` uses the matched node's `label` as the context section title

#### Scenario: Section not present in spec

- **WHEN** the selector matches no node in the spec
- **THEN** `CompileContext` skips that entry without error

#### Scenario: extract label only

- **WHEN** a `contextSections` entry declares `extract: label`
- **THEN** `CompileContext` injects only the matched node's identifying value, not its subtree content

#### Scenario: extract both

- **WHEN** a `contextSections` entry declares `extract: both` and the selector matches multiple nodes
- **THEN** `CompileContext` injects the label followed by the serialized content for each matched node separately

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

#### Scenario: Schema and project hooks merged

- **WHEN** both the schema and `specd.yaml` define `workflow` entries for the same step
- **THEN** schema hooks fire first, followed by project hooks, within the same `pre`/`post` event

#### Scenario: requires in specd.yaml workflow entry rejected

- **WHEN** a `specd.yaml` workflow entry includes a `requires` field
- **THEN** the config loader must reject it with a validation error

### Requirement: Project-level artifactRules

#### Scenario: Rules injected into compiled context

- **WHEN** `specd.yaml` defines artifactRules for artifact `specs`
- **THEN** `CompileContext` includes those rules in the compiled instruction block for the `specs` artifact

#### Scenario: Unknown artifact ID in artifactRules

- **WHEN** `specd.yaml` defines artifactRules for an artifact ID not present in the active schema
- **THEN** `SchemaRegistry` emits a warning at load time and ignores those rules

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

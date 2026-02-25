# Verification: Schema Format

## Requirements

### Requirement: Schema file structure

#### Scenario: Minimal valid schema

- **WHEN** a schema file contains `name`, `version`, and at least one artifact
- **THEN** `SchemaRegistry.resolve()` must return the parsed schema without error

#### Scenario: Missing required field

- **WHEN** a schema file is missing `name` or `version`
- **THEN** `SchemaRegistry.resolve()` must throw a validation error

### Requirement: Delta operation keywords

#### Scenario: Custom operation keywords

- **WHEN** a schema defines `deltaOperations.added: "AÑADIDO"`
- **THEN** delta files using `## AÑADIDO Requirements` are processed correctly by `mergeSpecs`

#### Scenario: Partial override

- **WHEN** a schema defines only `deltaOperations.added` and omits the rest
- **THEN** the omitted keys fall back to their specd defaults

#### Scenario: Default keywords

- **WHEN** a schema omits `deltaOperations` entirely
- **THEN** `mergeSpecs` uses `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED`

### Requirement: Artifact definition

#### Scenario: Filename derived from glob literal segment

- **WHEN** an artifact declares `output: "specs/**/spec.md"` and a new file is created within the change
- **THEN** the file is named `spec.md`; the subdirectory path (e.g. `auth/login/`) is chosen by the user

#### Scenario: Filename derived from template when glob segment is a wildcard

- **WHEN** an artifact declares `output: "specs/**/*.md"` and `template: "templates/spec.md"`
- **THEN** the file is named `spec.md`, taken from the template filename

#### Scenario: Change file path differs from synced repo path

- **WHEN** a change contains `changes/my-change/specs/auth/login/spec.md` and the project syncs to `especificaciones/`
- **THEN** the file is copied to `especificaciones/auth/login/spec.md`; `output` does not control the sync destination

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
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` — a non-optional artifact cannot hard-depend on an optional one

#### Scenario: Optional artifact requiring optional artifact is valid

- **WHEN** artifact A is `optional: true` and artifact B is also `optional: true` and declares `requires: [a]`
- **THEN** `SchemaRegistry.resolve()` loads successfully — the constraint is satisfied

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

### Requirement: Delta configuration

#### Scenario: Multiple delta configs

- **WHEN** an artifact declares multiple entries in `deltas`
- **THEN** each entry is processed independently against its own section

#### Scenario: Spec dependency added appears in ADDED section

- **GIVEN** a `specs` artifact with `deltas: [{ section: Spec Dependencies, pattern: '- \[`{name}`\]' }]`
- **WHEN** a delta adds `- [\`specs/core/config/spec.md\`](../config/spec.md) — reason`
- **THEN** the entry appears under `## ADDED Spec Dependencies` in the delta file, with `specs/core/config/spec.md` as the block name

#### Scenario: Spec dependency removed appears in REMOVED section

- **GIVEN** a dependency `specs/core/config/spec.md` exists in the base spec
- **WHEN** a delta removes it
- **THEN** the entry appears under `## REMOVED Spec Dependencies` in the delta file

#### Scenario: Spec dependency description changed appears in MODIFIED section

- **GIVEN** a dependency `specs/core/config/spec.md` exists in the base spec
- **WHEN** a delta updates only its description text
- **THEN** the full updated entry appears under `## MODIFIED Spec Dependencies` in the delta file

### Requirement: Delta merge operations

#### Scenario: RENAMED operation

- **WHEN** a delta spec contains a RENAMED section with `FROM: ### Requirement: Old` / `TO: ### Requirement: New`
- **THEN** the block is found by `Old`, its header is rewritten to `New`, and subsequent MODIFIED/REMOVED operations must use `New`

#### Scenario: REMOVED operation

- **WHEN** a delta spec contains a REMOVED section with `### Requirement: X`
- **THEN** block `X` is deleted from the base spec; if it does not exist, the removal is silently ignored

#### Scenario: MODIFIED operation

- **WHEN** a delta spec contains a MODIFIED section with a full `### Requirement: X` block
- **THEN** the block replaces the existing block; if the block does not exist, it is inserted

#### Scenario: ADDED operation

- **WHEN** a delta spec contains an ADDED section with `### Requirement: X` blocks
- **THEN** those blocks are appended to the section after all existing blocks

#### Scenario: Section created when missing

- **WHEN** the base spec has no `## Requirements` section and the delta adds blocks to it
- **THEN** the section is created in the merged spec

#### Scenario: Section removed when empty

- **WHEN** all blocks in a section are removed by the delta
- **THEN** the section itself is removed from the merged spec

### Requirement: Delta conflict detection

#### Scenario: MODIFIED and REMOVED name collision

- **WHEN** a delta spec lists the same requirement name in both MODIFIED and REMOVED
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: Duplicate name within ADDED

- **WHEN** a delta spec contains two ADDED blocks with the same requirement name
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: Duplicate name within MODIFIED

- **WHEN** a delta spec contains two MODIFIED blocks with the same requirement name
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: Duplicate name within REMOVED

- **WHEN** a delta spec contains two REMOVED entries with the same requirement name
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: Duplicate FROM name within RENAMED

- **WHEN** a delta spec contains two RENAMED entries with the same `FROM` name
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: Duplicate TO name within RENAMED

- **WHEN** a delta spec contains two RENAMED entries with the same `TO` name
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: MODIFIED and ADDED name collision

- **WHEN** a delta spec lists the same requirement name in both MODIFIED and ADDED
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: ADDED and REMOVED name collision

- **WHEN** a delta spec lists the same requirement name in both ADDED and REMOVED
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: MODIFIED references old name after RENAMED

- **WHEN** a delta spec renames `Old` to `New` and also has a MODIFIED block for `Old`
- **THEN** `mergeSpecs` must throw a conflict error (MODIFIED must use `New`)

#### Scenario: ADDED uses TO name from RENAMED

- **WHEN** a delta spec renames `Old` to `New` and also has an ADDED block named `New`
- **THEN** `mergeSpecs` must throw a conflict error — the name `New` is already taken by the renamed block

### Requirement: Pattern matching

#### Scenario: Pattern with {name} placeholder

- **WHEN** a rule has `pattern: "### Requirement: {name}"`
- **THEN** it matches any line of the form `### Requirement: <anything>`

#### Scenario: Regex pattern

- **WHEN** a rule has `pattern: "SHALL|MUST"`
- **THEN** it matches any occurrence of `SHALL` or `MUST` anywhere in the target content

#### Scenario: Literal pattern fallback

- **WHEN** a rule has a pattern that is not valid regex and contains no `{name}`
- **THEN** it is matched as a literal substring

#### Scenario: Pattern check inside nested sub-section

- **WHEN** a rule has `eachBlock: Decisions` and `pattern: "HAS TO"`, the block pattern is `### Decision: {name}`, and a block contains `#### New Decision: Redis` with `The system HAS TO use Redis` inside it
- **THEN** the pattern `"HAS TO"` matches because the check runs against the full block content including nested sub-sections at any depth

#### Scenario: Sub-section with name placeholder

- **WHEN** a rule has `eachBlock: Decisions` and `pattern: "#### New Decision: {name}"`, and a `### Decision: X` block contains `#### New Decision: Redis`
- **THEN** the pattern matches within that block; a block with no `#### New Decision: ` line fails

#### Scenario: eachBlock section not in deltas

- **WHEN** a rule has `eachBlock: "Decisions"` but `deltas[]` has no entry with `section: "Decisions"`
- **THEN** `ValidateSpec` must report a configuration error

### Requirement: Delta validations

#### Scenario: Section missing with required true

- **WHEN** a rule has `scope: "ADDED Requirements"` and `required: true` and the section does not exist
- **THEN** `ValidateSpec` must report an error — the pattern was not found

#### Scenario: Section missing with required false

- **WHEN** a rule has `scope: "ADDED Requirements"` and `required: false` and the section does not exist
- **THEN** `ValidateSpec` must report a warning — the pattern was not found

#### Scenario: Per-block check passes vacuously

- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and no blocks match that pattern
- **THEN** the rule passes regardless of `required` — there is nothing to validate

#### Scenario: Per-block check fails on missing pattern

- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and one block does not contain the pattern
- **THEN** `ValidateSpec` must report an error or warning based on `required`, identifying which block is missing the pattern

#### Scenario: scope section does not exist with eachBlock

- **WHEN** a rule has `scope: "ADDED Requirements"` and `eachBlock: "### Requirement: {name}"` and the section does not exist in the delta file
- **THEN** the rule passes vacuously — the section has no blocks to iterate; use a separate file-level rule to enforce section existence

#### Scenario: Custom keywords in scope

- **WHEN** the schema defines `deltaOperations.added: "AÑADIDO"` and a rule has `scope: "AÑADIDO Requirements"`
- **THEN** the check is run against the `## AÑADIDO Requirements` section of the delta file

#### Scenario: ADDED Spec Dependencies section absent — passes vacuously

- **GIVEN** a `deltaValidation` with `scope: 'ADDED Spec Dependencies'` and `required: false`
- **WHEN** the delta file has no `## ADDED Spec Dependencies` section
- **THEN** the rule passes with no warning — the section is optional

#### Scenario: ADDED Spec Dependencies entry missing link format — warning

- **GIVEN** a `deltaValidation` with `scope: 'ADDED Spec Dependencies'`, `pattern: '- \[`[^`]+`\]\([^)]+\)'`, and `required: false`
- **WHEN** the `## ADDED Spec Dependencies` section contains an entry without a proper markdown link
- **THEN** `ValidateSpec` emits a warning identifying the malformed entry

#### Scenario: ADDED Spec Dependencies entry missing description — warning

- **GIVEN** a `deltaValidation` with `scope: 'ADDED Spec Dependencies'`, `pattern: ' — '`, and `required: false`
- **WHEN** the `## ADDED Spec Dependencies` section contains an entry with no `—` description
- **THEN** `ValidateSpec` emits a warning — the dependency does not explain why it is needed

#### Scenario: MODIFIED Spec Dependencies validated same as ADDED

- **GIVEN** the same `deltaValidation` rules applied to `scope: 'MODIFIED Spec Dependencies'`
- **WHEN** a modified entry is missing a link format or description
- **THEN** `ValidateSpec` emits the same warnings as for ADDED entries

### Requirement: Validation rules

#### Scenario: File-level required pattern

- **WHEN** a rule has `required: true` and no `scope` or `eachBlock`
- **THEN** `ValidateSpec` must report an error if the pattern is not found anywhere in the file

#### Scenario: Section missing with required true

- **WHEN** a rule has `scope: Requirements` and `required: true` and the section does not exist
- **THEN** `ValidateSpec` must report an error — the pattern was not found

#### Scenario: Section missing with required false

- **WHEN** a rule has `scope: Requirements` and `required: false` and the section does not exist
- **THEN** `ValidateSpec` must report a warning — the pattern was not found

#### Scenario: Per-block passes vacuously with no blocks

- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and no blocks match
- **THEN** the rule passes regardless of `required` — there is nothing to validate

#### Scenario: Per-block fails on missing pattern

- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and one block does not contain the pattern
- **THEN** `ValidateSpec` must report an error or warning based on `required`, identifying which block is missing the pattern

#### Scenario: scope section does not exist with eachBlock

- **WHEN** a rule has `scope: Requirements` and `eachBlock: "### Requirement: {name}"` and the section does not exist in the spec
- **THEN** the rule passes vacuously — the section has no blocks to iterate; use a separate file-level rule to enforce section existence

### Requirement: Per-spec approval

#### Scenario: New spec requires approval

- **WHEN** a delta creates a new spec via an `added` operation
- **THEN** that spec path must be approved before archiving

#### Scenario: Modified spec requires approval

- **WHEN** a delta modifies, removes blocks from, or renames blocks in an existing spec
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

#### Scenario: Both patterns used to report progress

- **GIVEN** an artifact with both `incompletePattern` and `completePattern` declared
- **AND** its file has 4 complete items and 1 incomplete item
- **WHEN** the CLI reports progress
- **THEN** it reports `4/5 tasks complete`

#### Scenario: All tasks complete — no incomplete matches

- **GIVEN** an artifact file where all checkboxes are checked (`- [x]`) and none are unchecked
- **WHEN** the `implementing → verifying` transition is attempted
- **THEN** `incompletePattern` matches zero lines and the transition is allowed

#### Scenario: taskCompletionCheck omitted entirely — defaults apply

- **GIVEN** an artifact with no `taskCompletionCheck` field
- **WHEN** the schema is loaded
- **THEN** the artifact behaves as if `incompletePattern: '^\s*-\s+\[ \]'` and `completePattern: '^\s*-\s+\[x\]'` were declared

### Requirement: preHashCleanup

#### Scenario: Substitution applied before hashing

- **GIVEN** an artifact with `preHashCleanup: [{ pattern: '^\s*-\s+\[x\]', replacement: '- [ ]' }]`
- **AND** its file contains `- [x] implement logout`
- **WHEN** the hash is computed
- **THEN** the substitution is applied first and the hash is computed on the normalized content, not the original

#### Scenario: Checking a task off does not invalidate approval

- **GIVEN** an artifact with `preHashCleanup` that normalizes checked boxes to unchecked
- **AND** the artifact was approved with some tasks unchecked
- **WHEN** tasks are marked complete (boxes checked)
- **THEN** the approval hash still matches — the transition does not require re-approval

#### Scenario: Multiple substitutions applied in order

- **GIVEN** an artifact with two `preHashCleanup` entries: first normalizes `[x]` to `[ ]`, second strips trailing whitespace
- **WHEN** the hash is computed
- **THEN** the first substitution is applied to the full content, then the second is applied to the result of the first

#### Scenario: preHashCleanup omitted

- **WHEN** an artifact declares no `preHashCleanup`
- **THEN** the hash is computed directly from the file content with no normalization

### Requirement: Context sections

#### Scenario: Section injected

- **WHEN** an artifact has a `contextSections` entry and the spec contains that section
- **THEN** `CompileContext` includes the section content in the compiled context under the given `contextTitle`

#### Scenario: contextTitle omitted

- **WHEN** a `contextSections` entry has no `contextTitle`
- **THEN** `CompileContext` uses `name` as the context section title

#### Scenario: Section not present in spec

- **WHEN** the spec does not contain the named section
- **THEN** `CompileContext` skips that entry without error

### Requirement: Artifact scope

#### Scenario: Missing non-optional artifact in change

- **WHEN** a change is missing an artifact with `optional: false`
- **THEN** `ValidateSpec` must report a validation error

#### Scenario: Optional artifact absent from change

- **WHEN** a change is missing an artifact with `optional: true`
- **THEN** `ValidateSpec` does not report a validation error for that artifact

#### Scenario: Missing scope:spec artifact file in spec directory

- **WHEN** a spec directory at `specs/<name>/` is missing a file for a non-optional `scope: spec` artifact
- **THEN** `specd validate` must report that spec as incomplete

#### Scenario: scope:change artifact not present in spec directory

- **WHEN** a `scope: change` artifact (e.g. `proposal.md`) is present in the change
- **THEN** it is validated but never synced to `specs/<name>/` — it must not appear in spec directory checks

#### Scenario: LLM context includes all scope:spec artifacts

- **WHEN** specd compiles context for a spec
- **THEN** it reads every `scope: spec` artifact file from the spec directory and includes them all

### Requirement: Workflow

#### Scenario: Pre hook failure aborts step

- **WHEN** a `pre` `run:` hook exits with a non-zero code
- **THEN** the step is aborted, the user is informed of the failure, and the agent offers to attempt to fix the problem before retrying

#### Scenario: Post hook failure prompts user

- **WHEN** a `post` `run:` hook exits with a non-zero code
- **THEN** the user is prompted to choose whether to continue with remaining hooks or stop; the completed step operation is not rolled back

#### Scenario: Step with unsatisfied prerequisites

- **WHEN** a step's `requires` lists an artifact that is not `complete`
- **THEN** `CompileContext` must report that the step is blocked and which artifacts are incomplete

#### Scenario: Step with no prerequisites

- **WHEN** a step has an empty or omitted `requires`
- **THEN** the step is always available regardless of artifact state

#### Scenario: Apply scans required artifacts for tasks

- **WHEN** the `apply` step has `requires: [tasks]` and `tasks.md` contains markdown checkboxes
- **THEN** the apply step reads pending tasks from `tasks.md` and surfaces them in the compiled context

#### Scenario: Tasks spread across multiple artifacts

- **WHEN** the `apply` step has `requires: [tasks, specs]`
- **THEN** the apply step scans both artifacts for checkboxes and aggregates them

#### Scenario: Schema and project hooks merged

- **WHEN** both the schema and `specd.yaml` define `workflow` entries for the same step
- **THEN** schema hooks fire first, followed by project hooks, within the same `pre`/`post` event

#### Scenario: Project-level entry adds a new hook

- **WHEN** `specd.yaml` defines a `workflow` entry for a step with no hooks in the schema
- **THEN** the project hooks are appended without error

### Requirement: Project-level artifactRules

#### Scenario: Rules injected into compiled context

- **WHEN** `specd.yaml` defines artifactRules for artifact `specs`
- **THEN** `CompileContext` includes those artifactRules in the compiled instruction block for the `specs` artifact, clearly marked as constraints the agent must follow but not copy into its output

#### Scenario: Unknown artifact ID in artifactRules

- **WHEN** `specd.yaml` defines artifactRules for an artifact ID not present in the active schema
- **THEN** `SchemaRegistry` emits a warning at load time and ignores those artifactRules

### Requirement: Schema resolution

#### Scenario: npm package resolved

- **WHEN** `schema: "@specd/schema-std"` is declared
- **THEN** `SchemaRegistry.resolve()` loads `node_modules/@specd/schema-std/schema.yaml`

#### Scenario: Bare name resolved from default workspace

- **WHEN** `schema: "spec-driven"` is declared and `workspaces.default.schemas.fs.path` is `specd/schemas`
- **THEN** `SchemaRegistry.resolve()` loads `specd/schemas/spec-driven/schema.yaml`

#### Scenario: Hash-prefixed name is equivalent to bare name

- **WHEN** `schema: "#spec-driven"` is declared
- **THEN** `SchemaRegistry.resolve()` behaves identically to the bare name form

#### Scenario: Scope-qualified name resolved

- **WHEN** `schema: "#billing:my-schema"` is declared and `workspaces.billing.schemas.fs.path` is `../billing/dev/schemas`
- **THEN** `SchemaRegistry.resolve()` loads `../billing/dev/schemas/my-schema/schema.yaml`

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

#### Scenario: Duplicate delta section

- **WHEN** an artifact declares two `deltas` entries with the same `section`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Duplicate workflow step

- **WHEN** the `workflow` array contains two entries with the same `step` name
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Unknown artifact ID in requires

- **WHEN** an artifact declares `requires: [unknown-id]` and no artifact with that ID exists in the schema
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

### Requirement: verify.md format

#### Scenario: verify.md compiled with spec.md

- **WHEN** specd compiles context for a spec that has both `spec` and `verify` artifacts with `scope: spec`
- **THEN** both `spec.md` and `verify.md` are read and included together in the LLM context

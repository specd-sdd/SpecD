# Verification: Change Validate

## Requirements

### Requirement: Command signature

#### Scenario: Missing arguments — but artifact targets change-scoped

- **WHEN** `specd change validate my-change --artifact design` is run (no spec ID)
- **AND** `design` is a `scope: change` artifact in the schema
- **THEN** the command proceeds with validation using artifact ID only
- **AND** it does NOT require specPath because design is change-scoped
- **AND** the process exits with code 0 if design passes validation

#### Scenario: Missing arguments with scope: spec artifact

- **WHEN** `specd change validate my-change --artifact specs` is run (no spec ID)
- **AND** `specs` is a `scope: spec` artifact in the schema
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Artifact flag accepted

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **WHEN** `specd change validate my-change default:auth/login --artifact proposal` is run
- **THEN** the command invokes validation for only the `proposal` artifact
- **AND** the process exits with code 0 if `proposal` passes validation

### Requirement: Behaviour

#### Scenario: File path details come from validation metadata

- **GIVEN** `ValidateArtifacts.execute` returns a file entry with filename `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:config --artifact specs` renders output
- **THEN** the CLI prints or serializes that filename from the result metadata
- **AND** it does not recompute a replacement path in the CLI layer

### Requirement: Structural validation scope

#### Scenario: Successful validate does not imply semantic approval

- **GIVEN** `specd changes validate my-change core:config` passes
- **WHEN** a workflow step evaluates artifact quality
- **THEN** the pass result is treated as structural/state validation only
- **AND** semantic/content review remains a separate required activity

### Requirement: Output on success

#### Scenario: All artifacts pass, no notes

- **GIVEN** a change where all artifacts pass validation
- **AND** validation reports file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:config` is run
- **THEN** stdout contains `validated my-change/core:config: all artifacts pass`
- **AND** stdout contains `file: deltas/core/core/config/spec.md.delta.yaml`
- **AND** stdout contains `specd changes spec-preview my-change core:config`
- **AND** the process exits with code 0

#### Scenario: Pass with notes

- **GIVEN** a change where artifacts pass but there are optimization notes
- **AND** validation reports file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:config` is run
- **THEN** stdout contains a pass message with `pass (N note(s))`
- **AND** stdout contains `note:` lines for each note
- **AND** stdout contains `file: deltas/core/core/config/spec.md.delta.yaml`
- **AND** stdout contains `specd changes spec-preview my-change core:config`
- **AND** the process exits with code 0

#### Scenario: Successful delta-backed spec artifact validation shows inline diff

- **GIVEN** `specs` is a `scope: spec` artifact backed by an existing delta-applied base file
- **AND** validation succeeds for `specd change validate my-change core:config --artifact specs`
- **AND** the delta merge materializes successfully for review
- **WHEN** text output is rendered
- **THEN** stdout contains the validated file path lines
- **AND** stdout contains the structural-validation reminder note
- **AND** stdout renders the unified diff for only the validated artifact
- **AND** stdout does NOT contain a `specd changes spec-preview` follow-up hint

#### Scenario: Diff-generation failure after successful validation falls back to preview note

- **GIVEN** validation succeeds for `specd change validate my-change core:config --artifact specs`
- **AND** inline diff review qualifies for that target
- **AND** diff generation raises `DiffGenerationError` after merge preview has already succeeded
- **WHEN** text output is rendered
- **THEN** stdout still reports validation success
- **AND** stdout omits inline diff output
- **AND** stdout includes a `note:` telling the reviewer to run `specd changes spec-preview my-change core:config --diff --artifact specs`
- **AND** the process exits with code 0

#### Scenario: JSON output on pass includes notes and files

- **GIVEN** a change where all artifacts pass validation with optimization notes
- **AND** validation reports file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:config --artifact specs --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `true`, `failures` equal to `[]`, and a `notes` array
- **AND** `files` contains an entry with `filename: \"deltas/core/core/config/spec.md.delta.yaml\"`
- **AND** the process exits with code 0

### Requirement: Output on failure

#### Scenario: Validation failures with notes

- **GIVEN** a change where a required artifact fails validation and has optimization notes
- **AND** validation reports missing file `deltas/core/core/config/spec.md.delta.yaml`
- **WHEN** `specd change validate my-change core:config --artifact specs` is run
- **THEN** stdout contains `validation failed`
- **AND** stdout contains `missing: deltas/core/core/config/spec.md.delta.yaml`
- **AND** stdout contains `error:` lines for each failure
- **AND** stdout contains `note:` lines for each note
- **AND** the process exits with code 1

#### Scenario: Failed single-artifact spec validation omits inline diff review

- **GIVEN** `specs` is a delta-backed `scope: spec` artifact
- **AND** `specd change validate my-change core:config --artifact specs` fails validation
- **WHEN** text output is rendered
- **THEN** stdout reports only the validation failure details
- **AND** stdout does NOT render an inline diff
- **AND** stdout does NOT present any merged review surface as a trustworthy checkpoint

#### Scenario: JSON output on failure includes notes and files

- **GIVEN** a change where a required artifact fails validation and has notes
- **WHEN** `specd change validate my-change core:config --artifact specs --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `false`
- **AND** `failures` contains at least one entry
- **AND** `notes` contains the optimization suggestions
- **AND** the process exits with code 1

#### Scenario: Dependency-block failure preserves core blocker status context

- **GIVEN** validation reports a dependency-blocked failure from core including dependency status context
- **WHEN** `specd change validate my-change core:config --artifact specs` is run
- **THEN** stdout contains the failure description exactly as emitted by core validation
- **AND** the CLI does not replace it with generic "incomplete dependency" wording
- **AND** the CLI does not recompute blocker semantics locally

### Requirement: Spec ID not in change

#### Scenario: Unknown spec ID

- **GIVEN** a change with specId `default:auth/login`
- **WHEN** `specd change validate my-change default:billing/invoices` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change validate nonexistent default:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Unknown artifact ID

#### Scenario: Unknown artifact ID exits with failure

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **AND** the active schema has no artifact with ID `nonexistent`
- **WHEN** `specd change validate my-change default:auth/login --artifact nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stdout contains the validation failure describing the unknown artifact ID

#### Scenario: Unknown artifact ID with JSON format

- **GIVEN** a valid change `my-change` with spec `default:auth/login`
- **AND** the active schema has no artifact with ID `nonexistent`
- **WHEN** `specd change validate my-change default:auth/login --artifact nonexistent --format json` is run
- **THEN** stdout is valid JSON with `passed` equal to `false`
- **AND** `failures` contains an entry describing the unknown artifact ID
- **AND** the process exits with code 1

### Requirement: Batch mode (--all)

#### Scenario: Change-scoped batch step omits specPath

- **GIVEN** a change with `proposal` (change-scoped) and multiple `specIds`
- **WHEN** `specd changes validate <name> --all` runs
- **THEN** the change-scoped `proposal` step invokes `ValidateArtifacts` without a `specPath` argument

#### Scenario: --all walks DAG with change-scoped once and spec-scoped per specId

- **GIVEN** a change with specIds `["core:schema-format", "cli:change-validate"]` and valid deltas for the next incomplete DAG steps
- **WHEN** `specd change validate fix-validate-all-dag --all` is run
- **THEN** change-scoped artifacts such as `proposal` are validated once
- **AND** spec-scoped artifacts such as `specs` are validated once per specId
- **AND** validation order respects `artifactDag().topologicalOrder()` (parents before children)

#### Scenario: --all with specPath is rejected

- **WHEN** `specd change validate my-change default:auth/login --all` is run
- **THEN** stderr contains `error: --all and <specPath> are mutually exclusive` and exit code is 1

#### Scenario: neither specPath nor --all is rejected

- **WHEN** `specd change validate my-change` is run without specPath or --all
- **THEN** stderr contains `error: either <specPath> or --all is required` and exit code is 1

#### Scenario: --all with --artifact filters DAG steps

- **GIVEN** a change with 2 specIds and incomplete `specs` deltas
- **WHEN** `specd change validate my-change --all --artifact specs` is run
- **THEN** only `specs` validation steps run (once per specId)
- **AND** other artifact types are not validated in that batch

#### Scenario: --all with partial failures exits 1

- **GIVEN** a batch where one scheduled step fails and another passes
- **WHEN** `specd change validate my-change --all` is run
- **THEN** all scheduled steps still run
- **AND** exit code is 1

#### Scenario: --all JSON output lists scheduled steps

- **GIVEN** a batch where all scheduled steps pass
- **WHEN** `specd change validate my-change --all --format json` is run
- **THEN** output includes `passed`, `total`, and `results[]` with `artifact` and `spec` (null for change-scoped steps) per entry

#### Scenario: --all uses kernel validateBatch

- **WHEN** `specd changes validate <name> --all` runs
- **THEN** CLI calls `kernel.changes.validateBatch.execute({ name })` once
- **AND** does not loop `specIds` with `ValidateArtifacts` directly in the CLI layer

#### Scenario: --all --artifact forwards filter

- **WHEN** `specd changes validate <name> --all --artifact specs` runs
- **THEN** `validateBatch.execute` receives `{ name, artifactId: 'specs' }`

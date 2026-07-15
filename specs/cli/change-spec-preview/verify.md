# Verification: Change Spec Preview

## Requirements

### Requirement: Command signature

#### Scenario: Minimal invocation

- **GIVEN** a valid change `my-change` with spec `core:config`
- **WHEN** `specd change spec-preview my-change core:config` is invoked
- **THEN** the command succeeds and outputs the merged spec content in text format

#### Scenario: Diff flag

- **GIVEN** a valid change with a delta for `core:config`
- **WHEN** `specd change spec-preview my-change core:config --diff` is invoked
- **THEN** the command outputs a unified diff instead of the full merged content

### Requirement: Text output — merged mode (no --diff)

#### Scenario: Files separated by header lines with status labels

- **GIVEN** a change with `merged`, `no-op`, and `missing` artifacts
- **WHEN** the command is invoked without `--diff`
- **THEN** each file header includes the appropriate label
- **AND** `spec.md` with status `merged` header is `--- spec.md ---`
- **AND** `verify.md` with status `no-op` header is `--- verify.md --- (no-op delta, showing original)`
- **AND** `other.md` with status `missing` (delta) header is `--- other.md --- (missing artifact, showing original)`
- **AND** `new.md` with status `missing` (new spec) header is `--- new.md --- (missing artifact)`

#### Scenario: Filtered artifact shows status label

- **GIVEN** a change where `specs` artifact is `no-op`
- **WHEN** `specd change spec-preview my-change my-spec --artifact specs` is run
- **THEN** stdout contains `--- spec.md --- (no-op delta, showing original)`

### Requirement: Text output — diff mode (--diff)

#### Scenario: Additions colored green

- **GIVEN** a diff-enabled preview result that contains added lines
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** lines starting with `+` are rendered in green

#### Scenario: Removals colored red

- **GIVEN** a diff-enabled preview result that contains removed lines
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** lines starting with `-` are rendered in red

#### Scenario: Hunk headers colored cyan

- **GIVEN** a diff-enabled preview result that contains hunk headers
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** lines starting with `@@` are rendered in cyan

#### Scenario: Context lines dimmed

- **GIVEN** a diff-enabled preview result with context lines
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** unchanged context lines are rendered in dim

#### Scenario: No-change files omitted in diff mode

- **GIVEN** a diff-enabled preview result where one file has `diff` output and another does not
- **WHEN** the command is invoked with `--diff`
- **THEN** only the file with returned diff output appears in the text output

#### Scenario: Filtered artifact in diff mode

- **GIVEN** a change with diff output for `spec.md` and `verify.md`
- **WHEN** `specd change spec-preview my-change my-spec --diff --artifact specs` is run
- **THEN** stdout contains `--- spec.md ---` and the colorized diff for `spec.md`
- **AND** stdout DOES NOT contain `--- verify.md ---`

#### Scenario: CLI does not synthesize unified diff text

- **GIVEN** `PreviewSpec` returns a precomputed `diff` string for a merged file
- **WHEN** the command is invoked with `--diff`
- **THEN** the CLI renders that returned diff
- **AND** it does not regenerate a unified diff from `base` and `merged`

### Requirement: JSON/TOON output

#### Scenario: JSON output returns PreviewSpecResult

- **GIVEN** a valid change with deltas
- **WHEN** the command is invoked with `--format json`
- **THEN** the output is a valid JSON object matching the `PreviewSpecResult` shape

#### Scenario: JSON diff output forwards non-colorized diff

- **GIVEN** a valid change with diff-enabled preview output
- **WHEN** the command is invoked with `--diff --format json`
- **THEN** each file entry includes the `diff` field returned by `PreviewSpec`
- **AND** the string contains no ANSI color codes

#### Scenario: JSON output with artifact filtering

- **GIVEN** a change with `spec.md` and `verify.md`
- **WHEN** `specd change spec-preview my-change my-spec --artifact specs --format json` is run
- **THEN** the `files` array in the JSON output contains exactly one entry
- **AND** the entry's `filename` is `spec.md`

### Requirement: Error handling

#### Scenario: Non-existent change exits with error

- **GIVEN** no change named `ghost`
- **WHEN** `specd change spec-preview ghost core:config` is invoked
- **THEN** the command prints an error message and exits with code 1

#### Scenario: Spec not in change exits with error and suggestion

- **GIVEN** a change `my-change` that does not include `core:other`
- **WHEN** `specd change spec-preview my-change core:other` is invoked
- **THEN** the command prints an error message
- **AND** the message includes `use specd specs show core:other`
- **AND** the command exits with code 1

#### Scenario: Warnings printed to stderr

- **GIVEN** a change where delta application produces warnings
- **WHEN** the command is invoked
- **THEN** warnings appear on stderr
- **AND** the command still exits successfully with the partial result on stdout

### Requirement: Drift and overlap review support

#### Scenario: Preview used as merged checkpoint under drift risk

- **GIVEN** a change has potential overlap/drift in spec deltas
- **WHEN** workflow guidance performs pre-acceptance review
- **THEN** `specd changes spec-preview <name> <specId>` provides merged content for checkpoint review

#### Scenario: Raw deltas are insufficient without merged preview

- **GIVEN** only raw delta files are inspected
- **WHEN** base spec content may have changed since delta authoring
- **THEN** this inspection is not treated as equivalent to merged preview verification

#### Scenario: Artifact-filtered preview for targeted review

- **GIVEN** review targets only one spec-scoped artifact
- **WHEN** `specd changes spec-preview` is used for the merged checkpoint
- **THEN** the command may include `--artifact <name>` and returns only that merged artifact output

### Requirement: Artifact filtering errors

#### Scenario: Unknown artifact ID exits with error

- **WHEN** `specd change spec-preview my-change my-spec --artifact nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message about unknown artifact ID

#### Scenario: Non-spec artifact exits with error

- **WHEN** `specd change spec-preview my-change my-spec --artifact proposal` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message about scope mismatch

#### Scenario: Artifact not in change exits with error

- **GIVEN** a change that doesn't have a delta for `verify.md` for the given spec
- **WHEN** `specd change spec-preview my-change my-spec --artifact verify` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message about missing artifact in change

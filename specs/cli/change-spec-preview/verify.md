# Verification: Change Spec Preview

## Requirements

### Requirement: Command signature

#### Scenario: Minimal invocation

- **GIVEN** a valid change `my-change` with spec `core:core/config`
- **WHEN** `specd change spec-preview my-change core:core/config` is invoked
- **THEN** the command succeeds and outputs the merged spec content in text format

#### Scenario: Diff flag

- **GIVEN** a valid change with a delta for `core:core/config`
- **WHEN** `specd change spec-preview my-change core:core/config --diff` is invoked
- **THEN** the command outputs a unified diff instead of the full merged content

### Requirement: Text output — merged mode

#### Scenario: Files separated by header lines

- **GIVEN** a change producing preview for `spec.md` and `verify.md`
- **WHEN** the command is invoked without `--diff`
- **THEN** each file is preceded by a `--- <filename> ---` separator line
- **AND** `spec.md` appears before `verify.md`

#### Scenario: Filtered artifact in merged mode

- **GIVEN** a change with `spec.md` and `verify.md`
- **WHEN** `specd change spec-preview my-change my-spec --artifact specs` is run
- **THEN** stdout contains `--- spec.md ---` and the merged spec content
- **AND** stdout DOES NOT contain `--- verify.md ---`

### Requirement: Text output — diff mode

#### Scenario: Additions colored green

- **GIVEN** a delta that adds lines to a spec
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** lines starting with `+` are rendered in green

#### Scenario: Removals colored red

- **GIVEN** a delta that removes lines from a spec
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** lines starting with `-` are rendered in red

#### Scenario: Hunk headers colored cyan

- **GIVEN** a delta producing a diff
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** lines starting with `@@` are rendered in cyan

#### Scenario: Context lines dimmed

- **GIVEN** a delta producing a diff with context lines
- **WHEN** the command is invoked with `--diff --format text`
- **THEN** unchanged context lines are rendered in dim

#### Scenario: No-change files omitted in diff mode

- **GIVEN** a change with a no-op delta for one artifact and a real delta for another
- **WHEN** the command is invoked with `--diff`
- **THEN** only the artifact with real changes appears in the output

#### Scenario: Filtered artifact in diff mode

- **GIVEN** a change with deltas in `spec.md` and `verify.md`
- **WHEN** `specd change spec-preview my-change my-spec --diff --artifact specs` is run
- **THEN** stdout contains `--- spec.md ---` and the colorized diff for `spec.md`
- **AND** stdout DOES NOT contain `--- verify.md ---`

### Requirement: JSON/TOON output

#### Scenario: JSON output returns PreviewSpecResult

- **GIVEN** a valid change with deltas
- **WHEN** the command is invoked with `--format json`
- **THEN** the output is a valid JSON object matching the `PreviewSpecResult` shape

#### Scenario: JSON diff output includes non-colorized diff

- **GIVEN** a valid change with deltas
- **WHEN** the command is invoked with `--diff --format json`
- **THEN** each file entry includes a `diff` field as a plain string without ANSI color codes

#### Scenario: JSON output with artifact filtering

- **GIVEN** a change with `spec.md` and `verify.md`
- **WHEN** `specd change spec-preview my-change my-spec --artifact specs --format json` is run
- **THEN** the `files` array in the JSON output contains exactly one entry
- **AND** the entry's `filename` is `spec.md`

### Requirement: Error handling

#### Scenario: Non-existent change exits with error

- **GIVEN** no change named `ghost`
- **WHEN** `specd change spec-preview ghost core:core/config` is invoked
- **THEN** the command prints an error message and exits with code 1

#### Scenario: Spec not in change exits with error

- **GIVEN** a change `my-change` that does not include `core:core/other`
- **WHEN** `specd change spec-preview my-change core:core/other` is invoked
- **THEN** the command prints an error message and exits with code 1

#### Scenario: Warnings printed to stderr

- **GIVEN** a change where delta application produces warnings
- **WHEN** the command is invoked
- **THEN** warnings appear on stderr
- **AND** the command still exits successfully with the partial result on stdout

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

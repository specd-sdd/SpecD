# Verification: Graph Index

## Requirements

### Requirement: Indexing behaviour

#### Scenario: Successful indexing with defaults

- **GIVEN** the current working directory is a valid workspace with TypeScript files
- **WHEN** `specd graph index` is run
- **THEN** stdout shows `Indexed N file(s) in Xms` followed by the summary lines
- **AND** the process exits with code 0

#### Scenario: Force flag clears existing data

- **GIVEN** the workspace has been previously indexed
- **WHEN** `specd graph index --force` is run
- **THEN** the `.lbug`, `.lbug.wal`, and `.lbug.lock` files are deleted before opening the provider
- **AND** `filesRemoved` in the output reflects the previously indexed files

#### Scenario: Custom path

- **GIVEN** `/tmp/my-project` is a valid workspace
- **WHEN** `specd graph index --path /tmp/my-project` is run
- **THEN** the provider is created with `/tmp/my-project` as the workspace path
- **AND** indexing operates on files within that directory

#### Scenario: Process exits explicitly

- **GIVEN** indexing completes successfully
- **WHEN** the provider is closed
- **THEN** `process.exit(0)` is called to prevent the LadybugDB addon from keeping the process alive

#### Scenario: --exclude-path merges on top of config excludePaths

- **GIVEN** workspace config has `graph.excludePaths: ["dist/"]`
- **AND** the command is run with `--exclude-path "fixtures/"`
- **WHEN** indexing runs
- **THEN** the effective exclusion list is `["dist/", "fixtures/"]`
- **AND** `specd.yaml` is not modified

### Requirement: Output format

#### Scenario: Text output shows summary

- **GIVEN** indexing discovers 459 files, indexes 387, skips 72, removes 0, indexes 122 specs, and has 0 errors in 1234ms
- **WHEN** `specd graph index` is run
- **THEN** stdout contains `Indexed 387 file(s) in 1234ms`
- **AND** stdout contains `discovered: 459`
- **AND** stdout contains `skipped:    72`
- **AND** stdout contains `errors:     0`

#### Scenario: Text output with errors

- **GIVEN** indexing completes with 2 per-file errors
- **WHEN** `specd graph index` is run
- **THEN** stdout shows `errors:     2`
- **AND** each error is listed below with its file path and message
- **AND** the process exits with code 0

#### Scenario: JSON output

- **GIVEN** indexing completes successfully
- **WHEN** `specd graph index --format json` is run
- **THEN** stdout is valid JSON containing `filesDiscovered`, `filesIndexed`, `filesSkipped`, `filesRemoved`, `specsIndexed`, `errors`, and `duration`

### Requirement: Error cases

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened (e.g. database I/O error)
- **WHEN** `specd graph index` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

#### Scenario: Per-file errors do not cause non-zero exit

- **GIVEN** indexing encounters parse failures in some files
- **WHEN** `specd graph index` is run
- **THEN** the errors are included in the `errors` array of the output
- **AND** the process exits with code 0

### Requirement: CLI reference documentation

#### Scenario: graph section present in CLI reference

- **WHEN** `docs/cli/cli-reference.md` is inspected
- **THEN** a `## graph` section exists covering `index`, `search`, `hotspots`, `stats`, and `impact`

#### Scenario: graph index flags documented

- **WHEN** the `### graph index` subsection is read
- **THEN** `--exclude-path`, `--workspace`, `--force`, and `--format` are documented with descriptions
- **AND** the `graph.excludePaths` and `graph.respectGitignore` config fields are explained
- **AND** an example shows negation syntax (e.g. `!.specd/metadata/`)

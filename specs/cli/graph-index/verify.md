# Verification: Graph Index

## Requirements

### Requirement: Command signature

#### Scenario: Minimal invocation with defaults

- **WHEN** `specd graph index` is run
- **THEN** it accepts no positional arguments
- **AND** output format defaults to text

### Requirement: Output format

#### Scenario: Text output shows summary including documents

- **GIVEN** indexing discovers 459 files, indexes 387, indexes 18 documents, skips 72, removes 0, indexes 122 specs, and has 0 errors in 1234ms
- **WHEN** `specd graph index` is run
- **THEN** stdout contains `Indexed 387 file(s) in 1234ms`
- **AND** stdout contains `discovered: 459`
- **AND** stdout contains `documents:  18`
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
- **THEN** stdout is valid JSON containing `filesDiscovered`, `filesIndexed`, `documentsIndexed`, `filesSkipped`, `filesRemoved`, `specsIndexed`, `errors`, and `duration`

### Requirement: Error cases

#### Scenario: Mutually exclusive context flags fail fast

- **WHEN** `specd graph index --config ./specd.yaml --path .` is run
- **THEN** stderr contains a CLI error about incompatible flags
- **AND** no graph provider is opened
- **AND** the process exits with code 1

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened (e.g. database I/O error)
- **WHEN** `specd graph index` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

#### Scenario: Lock acquisition failure exits with code 3

- **GIVEN** another process currently holds the shared graph indexing lock
- **WHEN** `specd graph index` is run
- **THEN** stderr contains a retry-later message
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
- **THEN** `--exclude-path`, `--force`, `--config`, `--path`, and `--format` are documented with descriptions
- **AND** project-global `graph.includePaths`, global `graph.excludePaths`, and workspace `graph.respectGitignore` / `graph.allowedPaths` behavior are explained
- **AND** the bootstrap-only nature of `--path` and no-config fallback is stated

### Requirement: Indexing behaviour

#### Scenario: Command passes progress callback in text mode

- **WHEN** `specd graph index` is run in text mode
- **THEN** the command passes an `onProgress` callback to the provider
- **AND** when the callback is invoked, it prints the progress percentage and phase to stdout

#### Scenario: Command delegates configuration and locking

- **WHEN** `specd graph index` is executed
- **THEN** it delegates bootstrap config fallback, effective project config merging, lock acquisition, and index execution to the provider

#### Scenario: Worker subprocess performs indexing in isolation

- **GIVEN** `SPECD_GRAPH_INDEX_NO_WORKER` is not set
- **WHEN** `specd graph index` is run
- **THEN** the parent process spawns a child worker with `SPECD_GRAPH_INDEX_WORKER=true`
- **AND** the parent forwards `SIGINT` and `SIGTERM` to the worker
- **AND** the parent releases the indexing lock when the worker exits

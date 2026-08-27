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

### Requirement: Forced indexing result completeness

#### Scenario: Forced structured output reports complete reconsideration

- **GIVEN** a populated healthy graph and unchanged source content
- **WHEN** `graph index --force --format toon` completes
- **THEN** output identifies a forced full logical reindex and its stable reason
- **AND** selected unchanged source inputs are not counted as hash-matched skips
- **AND** indexed, unsupported, excluded, partial, coverage, and error classifications remain visible

#### Scenario: Forced text output does not hide skipped inputs

- **GIVEN** the SDK returns a forced result containing nonzero skipped or unsupported counts
- **WHEN** the CLI renders text output
- **THEN** the full-reindex indication and the returned classification counts are visible
- **AND** exit success is not presented as evidence that every input produced a graph node

#### Scenario: CLI preserves SDK reconstruction diagnostics

- **GIVEN** SDK orchestration returns a successful result with full-rebuild metadata and per-input diagnostics
- **WHEN** the command renders text, JSON, or TOON
- **THEN** it does not recompute or discard those fields
- **AND** structured output round-trips the fields unchanged

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

#### Scenario: Command delegates exactly once to the SDK isolated worker

- **WHEN** `specd graph index` executes after resolving its command context
- **THEN** it calls `runIsolatedGraphIndex` imported from `@specd/sdk` exactly once
- **AND** the call contains the resolved storage root, the packaged graph-index task
  module URL, a serializable configured-or-bootstrap context descriptor, the index
  input, and an optional progress callback

#### Scenario: CLI does not own lock or subprocess mechanics

- **WHEN** the graph-index command implementation and CLI package dependencies are
  inspected
- **THEN** the command does not import or call raw lock acquisition, assertion,
  lock-path, fork, IPC, signal-forwarding, or child-cleanup helpers
- **AND** the CLI has no direct dependency or import on `@specd/code-graph`

#### Scenario: Packaged task invokes SDK indexing once

- **GIVEN** the isolated child loads the trusted packaged CLI task module
- **WHEN** the task receives a valid configured-project descriptor
- **THEN** it reconstructs an equivalent configured SDK context from the explicit
  configuration location and workspace selection
- **AND** it calls `runIndexProjectGraph(ctx, input)` exactly once
- **AND** it returns the resulting `IndexResult` without CLI presentation fields

#### Scenario: Bootstrap context remains explicit

- **GIVEN** graph index was resolved through `--path` or the no-config bootstrap
  fallback
- **WHEN** the parent serializes and the child reconstructs the bootstrap descriptor
- **THEN** the descriptor retains the explicit bootstrap root and graph configuration
- **AND** the child does not discover or substitute a configured project implicitly

#### Scenario: Index options cross the process boundary unchanged

- **GIVEN** `--force` and one or more `--exclude-path` values were supplied
- **WHEN** the command constructs the worker task input
- **THEN** force and exclusion values reach `runIndexProjectGraph` unchanged

#### Scenario: Text progress is rendered by the parent

- **WHEN** `specd graph index` runs in text mode and the worker emits progress
- **THEN** the SDK worker forwards ordered progress events to the CLI callback
- **AND** the parent prints the progress percentage and phase to stdout

#### Scenario: Structured output remains progress-free

- **WHEN** `specd graph index` runs with a structured output format
- **THEN** the CLI omits the progress callback
- **AND** worker protocol traffic does not appear in stdout or the final result

#### Scenario: Built structured child output contains only one final result

- **GIVEN** a publish-shaped CLI run whose isolated child emits progress and a
  successful result
- **WHEN** `graph index` is invoked with `--format json` or `--format toon`
- **THEN** stdout contains exactly one parseable final structured result
- **AND** stdout contains no progress line, IPC envelope, or child diagnostic

#### Scenario: Forced built index returns normally

- **GIVEN** a healthy graph requiring a forced logical reindex through the packaged child task
- **WHEN** the CLI command completes after receiving the worker result
- **THEN** it exits with code 0 rather than an abnormal-worker error
- **AND** the child and graph lock have been cleaned up

#### Scenario: Force recovers only typed storage-open failures

- **GIVEN** a typed recoverable storage-open error
- **WHEN** the command is invoked with `--force`
- **THEN** it completes after one SDK-owned recreation and retry
- **AND** a non-forced command reports the original error without deleting storage

#### Scenario: Worker failures preserve CLI error semantics

- **GIVEN** lock acquisition, task loading, protocol validation, child termination,
  or task execution fails
- **WHEN** the SDK worker rejects with a typed failure
- **THEN** the command maps it to the existing fatal graph-index error path
- **AND** stderr is presentation-safe and the process exits with code 3

#### Scenario: Production indexing is always process-isolated

- **WHEN** production graph-index sources and tests are inspected
- **THEN** no `SPECD_GRAPH_INDEX_WORKER`, `SPECD_GRAPH_INDEX_NO_WORKER`, or equivalent
  public environment branch selects parent-process indexing
- **AND** tests use an explicit injected process adapter or worker test seam instead
  of disabling isolation in production code

### Requirement: Visible incompatibility repair

#### Scenario: CLI reports provider-owned repair

- **GIVEN** an incompatible schema or derivation fingerprint
- **WHEN** `graph index` runs in text and structured modes
- **THEN** SDK/provider repair performs the rebuild
- **AND** output includes stable full-rebuild flag, reason, and coverage/error counts

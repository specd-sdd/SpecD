# Verification: Graph Index

## Requirements

### Requirement: Indexing behaviour

#### Scenario: Successful indexing with autodetected config

- **GIVEN** the current working directory resolves to a project with `specd.yaml`
- **WHEN** `specd graph index` is run
- **THEN** the command uses the discovered config to build workspace index targets
- **AND** stdout shows `Indexed N file(s) in Xms` followed by the summary lines
- **AND** the process exits with code 0

#### Scenario: Explicit config path bypasses discovery

- **GIVEN** the current directory would autodiscover a different `specd.yaml`
- **WHEN** `specd graph index --config /tmp/other/specd.yaml` is run
- **THEN** the command uses `/tmp/other/specd.yaml` directly
- **AND** indexing targets come from that config rather than from autodiscovery

#### Scenario: Explicit path enters bootstrap mode

- **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph index --path /tmp/repo` is run
- **THEN** config discovery is ignored
- **AND** indexing runs against a synthetic single workspace `default` rooted at `/tmp/repo`

#### Scenario: Missing config falls back to bootstrap mode

- **GIVEN** no `specd.yaml` is found by autodiscovery
- **WHEN** `specd graph index` is run inside a repository
- **THEN** the command indexes the resolved VCS root in bootstrap mode as workspace `default`

#### Scenario: Force flag recreates backend state through the graph-store contract

- **GIVEN** the workspace has been previously indexed
- **WHEN** `specd graph index --force` is run
- **THEN** the command invokes the graph-store recreation capability before indexing
- **AND** the CLI does not delete backend-specific database files directly

#### Scenario: Indexing acquires the shared graph lock before mutation work

- **WHEN** `specd graph index` starts an indexing run
- **THEN** it acquires the shared graph indexing lock before opening the provider for mutation work

#### Scenario: Indexing releases the shared graph lock on shutdown

- **GIVEN** `specd graph index` acquired the shared graph indexing lock
- **WHEN** the command finishes normally or handles shutdown via signal
- **THEN** the lock is released before the process exits

#### Scenario: Competing indexing run fails fast while the lock is held

- **GIVEN** another `graph index` process already holds the shared graph indexing lock
- **WHEN** a second `specd graph index` is started
- **THEN** it exits with code 3
- **AND** it prints a short retry-later message explaining that the graph is currently being indexed

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
- **THEN** `--exclude-path`, `--workspace`, `--force`, `--config`, `--path`, and `--format` are documented with descriptions
- **AND** the `graph.excludePaths` and `graph.respectGitignore` config fields are explained
- **AND** the bootstrap-only nature of `--path` and no-config fallback is stated
- **AND** an example shows negation syntax (e.g. `!.specd/metadata/`)

# Verification: cli:spec-suggest

## Requirements

### Requirement: Command Surface & Options

#### Scenario: spec suggest runs with default options
- **GIVEN** A valid SpecD project
- **WHEN** `node packages/cli/dist/index.js spec suggest` is executed
- **THEN** It discovers candidate specifications and outputs the report.

#### Scenario: spec suggest formats machine-readable JSON
- **GIVEN** A valid SpecD project
- **WHEN** `node packages/cli/dist/index.js spec suggest --json` is executed
- **THEN** stdout contains valid JSON matching `SuggestSpecsResult` with `codeGraphStale` boolean.

### Requirement: Delegation to SDK

#### Scenario: CLI delegates execution directly to SDK SuggestSpecs
- **GIVEN** CLI command arguments
- **WHEN** Command action executes
- **THEN** It initializes `openSuggestSpecs` and passes validated parameters to `SuggestSpecs.execute()`.

### Requirement: Interactive Progress & Output Rendering

#### Scenario: Interactive mode renders @clack/prompts spinner and note box
- **GIVEN** An interactive TTY terminal
- **WHEN** `node packages/cli/dist/index.js spec suggest` runs
- **THEN** `@clack/prompts` displays intro banner, dynamic progress messages, and renders candidate specs inside a `clack.note` box using `wrapForClack`.

#### Scenario: Gap mode adapts intro, headers, and text mode outputs
- **GIVEN** A codebase with existing specifications
- **WHEN** `node packages/cli/dist/index.js spec suggest` is executed without `--ignore-current-specs`
- **THEN** The output uses `specification gaps:` (in text mode) and `Specification gaps` as the note header.

#### Scenario: Early staleness warning emitted in text mode
- **GIVEN** A project whose code graph index is stale
- **WHEN** `node packages/cli/dist/index.js spec suggest` is executed in text mode
- **THEN** An early warning is emitted immediately prior to heavy analysis recommending running `specd graph index`.

### Requirement: Concurrency & Error Handling

#### Scenario: Cache lock contention is handled gracefully in interactive mode
- **GIVEN** An active suggestion cache lock held by another process
- **WHEN** `node packages/cli/dist/index.js spec suggest` is executed in interactive mode
- **THEN** The active spinner is stopped gracefully (`Suggestion cache is busy`), an informative instruction is logged, and the CLI exits via `clack.outro` with exit code 1 without uncaught stack traces.

#### Scenario: Typed domain errors are formatted gracefully
- **GIVEN** An invalid workspace or configuration error occurs during execution
- **WHEN** CLI catches the error
- **THEN** `handleError` formats and outputs an actionable error message.

# Verification: Graph Impact

## Requirements

### Requirement: File impact analysis

#### Scenario: Upstream file analysis with defaults

- **GIVEN** `src/auth.ts` is indexed in the graph with upstream dependents
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** stdout shows `Impact analysis for src/auth.ts` with risk level, dependency counts, affected files with their affected symbols, and per-symbol breakdown
- **AND** the analysis direction is `upstream`
- **AND** the default depth is 3
- **AND** the process exits with code 0

#### Scenario: Downstream file analysis

- **GIVEN** `src/utils.ts` is indexed with downstream dependencies
- **WHEN** `specd graph impact --file src/utils.ts --direction downstream` is run
- **THEN** the analysis shows files and symbols that `src/utils.ts` depends on

#### Scenario: Both directions

- **GIVEN** `src/auth.ts` is indexed in the graph
- **WHEN** `specd graph impact --file src/auth.ts --direction both` is run
- **THEN** the analysis includes both upstream dependents and downstream dependencies

#### Scenario: Custom depth for file analysis

- **GIVEN** `src/auth.ts` is indexed with a deep dependency chain
- **WHEN** `specd graph impact --file src/auth.ts --depth 5` is run
- **THEN** the analysis traverses up to depth 5
- **AND** stdout header includes `(depth=5)`
- **AND** affected symbols show depth indicators up to `(d=5)`

### Requirement: Symbol impact analysis

#### Scenario: Single symbol match

- **GIVEN** `createKernel` exists once in the graph
- **WHEN** `specd graph impact --symbol createKernel` is run
- **THEN** stdout shows `Impact analysis for function createKernel (...)` with risk level and affected files

#### Scenario: Multiple symbol matches

- **GIVEN** `validate` exists in 3 different files
- **WHEN** `specd graph impact --symbol validate` is run
- **THEN** stdout shows `3 symbols match "validate":` followed by separate impact reports for each

#### Scenario: Symbol not found

- **GIVEN** `nonExistentSymbol` does not exist in the graph
- **WHEN** `specd graph impact --symbol nonExistentSymbol` is run
- **THEN** stdout shows `No symbol found matching "nonExistentSymbol".`
- **AND** the process exits with code 0

#### Scenario: Custom depth for symbol analysis

- **GIVEN** `createKernel` exists with transitive callers at depth 5
- **WHEN** `specd graph impact --symbol createKernel --depth 5` is run
- **THEN** the analysis includes dependents up to depth 5
- **AND** each affected symbol in the text output shows `(d=N)` with its depth

### Requirement: Change detection

#### Scenario: Changes across multiple files

- **GIVEN** `src/auth.ts` and `src/user.ts` are indexed with dependents
- **WHEN** `specd graph impact --changes src/auth.ts src/user.ts` is run
- **THEN** stdout shows the summary with changed symbol count, affected count, and risk level
- **AND** the affected files list is shown

#### Scenario: Changes with no dependents

- **GIVEN** `src/isolated.ts` has no dependents
- **WHEN** `specd graph impact --changes src/isolated.ts` is run
- **THEN** stdout shows the summary with `Risk: LOW`

### Requirement: Output format

#### Scenario: Text output shows risk level and counts

- **GIVEN** `src/auth.ts` has risk level HIGH with 6 direct, 3 indirect, and 1 transitive dependencies
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** stdout contains `Risk level:       HIGH`
- **AND** stdout contains `Direct deps:      6`

#### Scenario: Text output shows depth indicators

- **GIVEN** `src/auth.ts` has affected symbols at various depths
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** each affected symbol line includes a depth indicator `(d=N)` after the symbol name and line

#### Scenario: Non-default depth shown in header

- **WHEN** `specd graph impact --file src/auth.ts --depth 5` is run
- **THEN** stdout header includes `(depth=5)` after the file path

#### Scenario: Default depth not shown in header

- **WHEN** `specd graph impact --file src/auth.ts` is run without `--depth`
- **THEN** stdout header does not include a depth indicator

#### Scenario: JSON output includes depth in affectedSymbols

- **WHEN** `specd graph impact --file src/auth.ts --format json` is run
- **THEN** stdout is valid JSON containing `affectedSymbols` where each entry has `id`, `name`, `filePath`, `line`, and `depth`

#### Scenario: JSON output for symbol impact

- **WHEN** `specd graph impact --symbol createKernel --format json` is run
- **THEN** stdout is valid JSON containing `symbol` and `impact` objects

#### Scenario: JSON output for change detection

- **WHEN** `specd graph impact --changes src/auth.ts --format json` is run
- **THEN** stdout is valid JSON containing `changedFiles`, `changedSymbols`, `affectedSymbols`, `riskLevel`, and `summary`

### Requirement: Error cases

#### Scenario: No selector provided

- **WHEN** `specd graph impact` is run without any of `--file`, `--symbol`, or `--changes`
- **THEN** stderr contains `error: provide exactly one of --file, --symbol, or --changes`
- **AND** the process exits with code 1

#### Scenario: Multiple selectors provided

- **WHEN** `specd graph impact --file src/auth.ts --symbol validate` is run
- **THEN** stderr contains `error: provide exactly one of --file, --symbol, or --changes`
- **AND** the process exits with code 1

#### Scenario: Invalid depth value

- **WHEN** `specd graph impact --file src/auth.ts --depth 0` is run
- **THEN** the process exits with code 1
- **AND** stderr shows an error about invalid depth value

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

#### Scenario: Process exits explicitly

- **GIVEN** impact analysis completes successfully
- **WHEN** the provider is closed
- **THEN** `process.exit(0)` is called to prevent the LadybugDB addon from keeping the process alive

# Verification: Graph Impact

## Requirements

### Requirement: File impact analysis

#### Scenario: Upstream file analysis with defaults

- **GIVEN** `src/auth.ts` is indexed in the graph with upstream dependents
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** stdout shows `Impact analysis for src/auth.ts` with risk level, dependency counts, affected files, and per-symbol breakdown
- **AND** the analysis direction is `upstream`
- **AND** the process exits with code 0

#### Scenario: Downstream file analysis

- **GIVEN** `src/utils.ts` is indexed with downstream dependencies
- **WHEN** `specd graph impact --file src/utils.ts --direction downstream` is run
- **THEN** the analysis shows files and symbols that `src/utils.ts` depends on

#### Scenario: Both directions

- **GIVEN** `src/auth.ts` is indexed in the graph
- **WHEN** `specd graph impact --file src/auth.ts --direction both` is run
- **THEN** the analysis includes both upstream dependents and downstream dependencies

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

#### Scenario: JSON output for file impact

- **WHEN** `specd graph impact --file src/auth.ts --format json` is run
- **THEN** stdout is valid JSON containing `target`, `riskLevel`, `directDependents`, `affectedFiles`, and `symbols`

#### Scenario: JSON output for symbol impact

- **WHEN** `specd graph impact --symbol createKernel --format json` is run
- **THEN** stdout is valid JSON containing `symbol` and `impact` objects

#### Scenario: JSON output for change detection

- **WHEN** `specd graph impact --changes src/auth.ts --format json` is run
- **THEN** stdout is valid JSON containing `changedFiles`, `changedSymbols`, `affectedSymbols`, `riskLevel`, and `summary`

### Requirement: Error cases

#### Scenario: No mode provided

- **WHEN** `specd graph impact` is run without `--file`, `--symbol`, or `--changes`
- **THEN** stderr contains `error: provide --file, --symbol, or --changes`
- **AND** the process exits with code 1

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

#### Scenario: Process exits explicitly

- **GIVEN** impact analysis completes successfully
- **WHEN** the provider is closed
- **THEN** `process.exit(0)` is called to prevent the LadybugDB addon from keeping the process alive

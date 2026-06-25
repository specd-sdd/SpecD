# Verification: Graph Impact

## Requirements

### Requirement: Command signature

#### Scenario: Explicit config path bypasses discovery

- **GIVEN** the current directory would autodiscover a different `specd.yaml`
- **WHEN** `specd graph impact --file src/auth.ts --config /tmp/other/specd.yaml` is run
- **THEN** the command uses `/tmp/other/specd.yaml` directly

#### Scenario: Explicit path enters bootstrap mode

- **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph impact --file src/auth.ts --path /tmp/repo` is run
- **THEN** config discovery is ignored
- **AND** the command analyzes impact against a synthetic single workspace `default` rooted at `/tmp/repo`

#### Scenario: Invalid direction fails before provider access

- **WHEN** `specd graph impact --file src/auth.ts --direction sideways` is run
- **THEN** the command exits with code 1
- **AND** stderr explains that the direction value is invalid
- **AND** no graph provider is opened

#### Scenario: Removed --changes flag is rejected

- **WHEN** `specd graph impact --changes src/auth.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr does not present `--changes` as a supported selector

#### Scenario: Spec selector enters requirement impact mode

- **GIVEN** spec `core:change` is indexed in the graph
- **WHEN** `specd graph impact --spec core:change` is run
- **THEN** the command analyzes requirement impact for that spec
- **AND** no file or symbol selector is required

### Requirement: File impact analysis

#### Scenario: Upstream file analysis with defaults

- **GIVEN** `core:src/auth.ts` is indexed in the graph with upstream dependents
- **WHEN** `specd graph impact --file core:src/auth.ts` is run
- **THEN** stdout shows `Impact analysis for core:src/auth.ts` with risk level, dependency counts, affected files with their affected symbols, and per-symbol breakdown
- **AND** the analysis direction is `upstream`
- **AND** the default depth is 3
- **AND** the process exits with code 0

#### Scenario: Unprefixed relative file resolves through configRelativePath

- **GIVEN** file `core:src/auth.ts` is indexed with `configRelativePath` `packages/core/src/auth.ts`
- **WHEN** `specd graph impact --file packages/core/src/auth.ts` is run from the same configured project
- **THEN** the command resolves the canonical graph file `core:src/auth.ts`
- **AND** runs file impact analysis for that canonical file

#### Scenario: Absolute file path normalizes before lookup

- **GIVEN** file `core:src/auth.ts` is indexed with `configRelativePath` `packages/core/src/auth.ts`
- **WHEN** `specd graph impact --file /repo/packages/core/src/auth.ts` is run
- **THEN** the command normalizes the absolute path to `packages/core/src/auth.ts`
- **AND** resolves the canonical graph file `core:src/auth.ts`

#### Scenario: Ambiguous unprefixed selector fails with canonical matches

- **GIVEN** two indexed files share config-relative path `src/index.ts`
- **WHEN** `specd graph impact --file src/index.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr lists the matching canonical workspace-prefixed files

#### Scenario: Multi-file analysis aggregates file impact semantics

- **GIVEN** `core:src/auth.ts` and `cli:src/auth.ts` are indexed with dependents
- **WHEN** `specd graph impact --file core:src/auth.ts cli:src/auth.ts` is run
- **THEN** the command analyzes each file with file-impact semantics
- **AND** aggregates changed symbols, affected symbols, affected files, and overall risk across both files

#### Scenario: File selectors resolved via provider normalization

- **WHEN** `specd graph impact --file` is run with an absolute or project-relative path
- **THEN** it resolves correctly to the canonical graph identity through the provider
- **AND** analysis proceeds without error

### Requirement: Symbol impact analysis

#### Scenario: Single symbol match

- **GIVEN** `createKernel` exists once in the graph
- **WHEN** `specd graph impact --symbol createKernel` is run
- **THEN** stdout shows `Impact analysis for function createKernel (...)` with risk level and affected files

#### Scenario: Full symbol id selector resolves directly

- **GIVEN** symbol `packages/core/src/auth.ts:function:validate` is indexed
- **WHEN** `specd graph impact --symbol packages/core/src/auth.ts:function:validate` is run
- **THEN** the command resolves the symbol through `resolveSymbolSelector`
- **AND** analyzes impact for that exact symbol

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

### Requirement: Spec impact analysis

#### Scenario: Downstream spec analysis shows covered files and symbols

- **GIVEN** spec `core:change` covers file `core:src/change.ts` and symbol `core:Change.transition`
- **WHEN** `specd graph impact --spec core:change --direction downstream` is run
- **THEN** stdout shows the covered file and covered symbol in the impacted result

#### Scenario: Upstream spec analysis shows dependent specs

- **GIVEN** spec `core:archive-change` depends on `core:spec-lock`
- **WHEN** `specd graph impact --spec core:spec-lock --direction upstream` is run
- **THEN** stdout shows `core:archive-change` as an impacted spec

#### Missing spec fails with not-found error

- **GIVEN** spec `missing:spec` does not exist in the graph
- **WHEN** `specd graph impact --spec missing:spec` is run
- **THEN** stderr contains a not-found error for `missing:spec`
- **AND** the error uses machine-readable code `SPEC_NOT_FOUND`
- **AND** the process exits with code 1

### Requirement: Concurrent indexing guard

#### Scenario: Impact analysis fails fast while the indexing lock is present

- **GIVEN** a `graph index` process currently holds the shared graph indexing lock
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** the command exits with code 3 before opening the provider
- **AND** it prints a short retry-later message explaining that the graph is currently being indexed

### Requirement: Output format

#### Scenario: Text output shows risk level and counts

- **GIVEN** `core:src/auth.ts` has risk level HIGH with 6 direct, 3 indirect, and 1 transitive dependents
- **WHEN** `specd graph impact --file core:src/auth.ts` is run
- **THEN** stdout contains `Risk level:       HIGH`
- **AND** stdout contains `Direct deps:      6`

#### Scenario: Text output shows changed symbols for file impact

- **WHEN** `specd graph impact --file core:src/auth.ts` is run
- **THEN** text output includes a `Changed symbols:` block before the affected files list

#### Scenario: Multi-file text output shows grouped changed symbols

- **WHEN** `specd graph impact --file core:src/auth.ts cli:src/user.ts` is run
- **THEN** text output includes one aggregated summary
- **AND** a `Changed symbols:` block grouped by input file
- **AND** a per-file breakdown section

#### Scenario: JSON output includes changedSymbols for file impact

- **WHEN** `specd graph impact --file core:src/auth.ts --format json` is run
- **THEN** stdout is valid JSON containing `changedSymbols`, `affectedSymbols`, and `affectedFiles`

#### Scenario: JSON output for symbol impact

- **WHEN** `specd graph impact --symbol createKernel --format json` is run
- **THEN** stdout is valid JSON containing `symbol` and `impact` objects

#### Scenario: JSON output includes aggregate impact fields

- **WHEN** `specd graph impact --file <path> --format json` is run
- **THEN** stdout is valid JSON
- **AND** it contains `riskLevel`, `directDepsCount`, `indirectDepsCount`, `transitiveDepsCount`, and `affectedFilesCount`

#### Scenario: Impact paths are rendered relative to project root

- **WHEN** `specd graph impact` is run
- **THEN** all file paths in the output (e.g., `packages/core/src/index.ts`) are relative to the project root
- **AND** they do not include workspace-prefixed identities unless explicitly requested

### Requirement: Error cases

#### Scenario: No selector provided

- **WHEN** `specd graph impact` is run without `--file`, `--symbol`, or `--spec`
- **THEN** stderr contains `error: provide exactly one of --file, --symbol, or --spec`
- **AND** the process exits with code 1

#### Scenario: Multiple selectors provided

- **WHEN** `specd graph impact --file core:src/auth.ts --spec core:change` is run
- **THEN** stderr contains `error: provide exactly one of --file, --symbol, or --spec`
- **AND** the process exits with code 1

#### Scenario: Missing unprefixed selector reports normalized lookup

- **WHEN** `specd graph impact --file packages/core/src/missing.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr includes the normalized config-relative path that was searched

#### Scenario: Mutually exclusive context flags fail fast

- **WHEN** `specd graph impact --file core:src/auth.ts --config ./specd.yaml --path .` is run
- **THEN** the command exits with code 1 before any graph provider is opened

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened
- **WHEN** `specd graph impact --file core:src/auth.ts` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

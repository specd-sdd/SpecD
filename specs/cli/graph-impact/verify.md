# Verification: Graph Impact

## Requirements

### Requirement: File impact analysis

#### Scenario: Upstream file analysis with defaults

- **GIVEN** `core:src/auth.ts` is indexed in the graph with upstream dependents
- **WHEN** `specd graph impact --file core:src/auth.ts` is run
- **THEN** stdout shows `Impact analysis for core:src/auth.ts` with risk level, dependency counts, affected files with their affected symbols, and per-symbol breakdown
- **AND** the analysis direction is `upstream`
- **AND** the default depth is 3
- **AND** the process exits with code 0

#### Scenario: Impact uses SDK graph context

- **WHEN** `specd graph impact --file <path>` is executed
- **THEN** it resolves context via `resolveGraphCliContext` and opens via `withProvider`
- **AND** platform symbols are sourced from `@specd/sdk`

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

#### Scenario: Impact analysis surfaces provider busy after open

- **GIVEN** the provider reports `GRAPH_BUSY` during impact analysis
- **WHEN** `specd graph impact --file src/auth.ts` is run
- **THEN** the command exits with code 3
- **AND** it uses the infrastructure error path rather than a separate pre-open lock probe

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

### Requirement: Pure display-path projection

#### Scenario: File paths render without graph reads

- **GIVEN** an impact result with many affected symbols and files
- **WHEN** the command renders text and JSON output
- **THEN** every rendered path is a project-relative display path derived from configuration alone
- **AND** rendering performs no provider read and no availability validation per path

#### Scenario: Wide multi-file impact formats without overload

- **GIVEN** a multi-file impact result containing many input files and affected symbols
- **AND** the SQLite store is configured with `maxPendingOperations: 32`
- **WHEN** the command formats the result
- **THEN** formatting completes without `StoreOverloadError`
- **AND** each input file renders through its own workspace configuration while each affected file appears exactly once per contributing input file

#### Scenario: Availability validated once per run

- **GIVEN** one command run analyzing a wide graph
- **WHEN** the command runs to completion
- **THEN** exactly one availability/staleness validation occurs after provider open
- **AND** no per-symbol or per-file validation is issued during aggregation or formatting

### Requirement: Availability validated once per command

#### Scenario: Single availability validation per command run

- **GIVEN** a single impact command run
- **WHEN** the provider is opened and analysis begins
- **THEN** exactly one availability/staleness validation occurs
- **AND** no further availability checks are issued per file, per symbol, or per affected file

#### Scenario: Wide impact analysis does not trigger overload

- **GIVEN** a wide graph whose impact result contains many distinct files and symbols
- **AND** the SQLite store is configured with `maxPendingOperations: 32`
- **WHEN** impact analysis and formatting run to completion
- **THEN** the command completes without `StoreOverloadError`

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
- **OR** the provider reports `GRAPH_BUSY`
- **OR** the provider reports `GRAPH_PROVIDER_STALE`
- **WHEN** `specd graph impact --file core:src/auth.ts` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

### Requirement: Command signature

#### Scenario: Export selector requires both flags

- **WHEN** only `--export X` or only `--from barrel.ts` is supplied
- **THEN** the command fails usage validation before provider open

#### Scenario: Target families are exclusive

- **WHEN** export flags are combined with file, symbol, or spec
- **THEN** the command rejects the invocation

#### Scenario: Case-exact symbol selector wins

- **GIVEN** one declaration named `Change` and many variables named `change`
- **WHEN** impact receives `--symbol Change`
- **THEN** Code Graph selects the unique case-exact declaration and traverses only it

#### Scenario: Exact ambiguity is bounded and not traversed

- **GIVEN** several declarations have the same case-exact unqualified name
- **WHEN** impact receives that name
- **THEN** it returns a bounded deterministic ambiguity list and performs no traversal
- **AND** prefix or textual candidates are never accepted as targets

### Requirement: Public export impact analysis

#### Scenario: Structured output preserves two impact views

- **WHEN** one public export is analyzed in text, JSON, and TOON
- **THEN** each output identifies binding, target, chain, exact-route consumers, and complete canonical impact
- **AND** ambiguous candidates are not merged

#### Scenario: Common export name cannot hide the selected binding

- **GIVEN** more than twenty logical targets expose the same public name
- **AND** conservative resolution selects a target outside the first ranked search page
- **WHEN** public-export impact is requested for that target and surface
- **THEN** the command obtains the exact selected binding and reports its routes
- **AND** it does not filter a capped symbol-search page to recover the binding

### Requirement: File-impact covering-spec presentation

#### Scenario: Text separates direct and blast-radius coverage

- **GIVEN** one spec has direct evidence and another has only depth-greater-than-zero evidence
- **WHEN** file impact is rendered as text
- **THEN** the first appears under direct target coverage
- **AND** the second appears under blast-radius coverage

#### Scenario: Mixed evidence renders one spec

- **GIVEN** one spec has both direct and blast-radius evidence
- **WHEN** file impact is rendered
- **THEN** text shows it once in the direct group
- **AND** JSON and TOON preserve every ordered evidence item

#### Scenario: CLI projects provider coverage without re-querying

- **GIVEN** Code Graph returns file-only covering evidence
- **WHEN** the CLI renders single- or multi-file impact
- **THEN** it renders that evidence even when symbol coverage is empty
- **AND** it performs no independent coverage query or derivation

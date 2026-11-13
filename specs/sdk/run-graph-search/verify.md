# Verification: SDK Run Graph Search

## Requirements

### Requirement: runGraphSearch orchestration

#### Scenario: Full graph search with transient provider

- **GIVEN** a query matching symbols and documents
- **WHEN** `runGraphSearch(ctx, { query: "kernel" })` is executed without a caller-provided provider
- **THEN** a transient provider is opened via `withOpenGraphProvider`
- **AND** `symbols`, `files`, `specs`, and `documents` results are returned
- **AND** the provider is cleanly closed after execution

#### Scenario: Graph search with caller-owned open provider

- **GIVEN** an open caller-provided `CodeGraphProvider`
- **WHEN** `runGraphSearch(ctx, { query: "kernel", provider })` is executed
- **THEN** search executes directly on the open provider
- **AND** the provider is not closed by the SDK

#### Scenario: Symbols expose projectRelativePath on declarations, hits, and logical targets

- **GIVEN** indexed symbols in a multi-workspace repository
- **WHEN** `runGraphSearch` returns matching symbols
- **THEN** every declaration location includes `projectRelativePath`
- **AND** every symbol hit includes `projectRelativePath`
- **AND** every logical target surface includes `projectRelativePath`

#### Scenario: Files and documents expose projectRelativePath

- **GIVEN** indexed source files and markdown documents
- **WHEN** `runGraphSearch` returns file and document matches
- **THEN** each entry exposes canonical `path` and `projectRelativePath`

#### Scenario: All search options forwarded to provider

- **GIVEN** a search request with `kinds`, `workspace`, `excludePaths`, `excludeWorkspaces`, `fileCategories`, `includeTests`, `includeIgnored`, `limit`, and `exactFile`
- **WHEN** `runGraphSearch(ctx, input)` is executed
- **THEN** all options are forwarded to `provider.search(...)` without loss or alteration

#### Scenario: Aliases file/filePattern and snippet/includeSnippet behave identically

- **GIVEN** requests using either `file` or `filePattern`, and `snippet` or `includeSnippet`
- **WHEN** `runGraphSearch` is invoked with either spelling
- **THEN** both spellings map to the same `filePattern` and `includeSnippet` values on the underlying search request

### Requirement: Elimination of legacy path properties

#### Scenario: configRelativePath is not present

- **WHEN** `runGraphSearch` returns results for files or documents
- **THEN** neither file nor document results contain `configRelativePath`

#### Scenario: displayPath is not present

- **WHEN** `runGraphSearch` returns results
- **THEN** result objects do not contain `displayPath`

### Requirement: Pure path projection

#### Scenario: Path projection does not invoke provider or store reads

- **WHEN** canonical paths are projected to `projectRelativePath`
- **THEN** projection uses project and workspace configuration without graph store reads

### Requirement: No presenter formatting

#### Scenario: Pure structured data returned

- **WHEN** `runGraphSearch` completes
- **THEN** the returned object contains structured data arrays and counts
- **AND** contains no ANSI escape codes, terminal formatting, or CLI presentation strings

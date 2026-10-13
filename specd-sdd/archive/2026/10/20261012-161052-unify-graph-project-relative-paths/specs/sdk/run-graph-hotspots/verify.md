# Verification: SDK Run Graph Hotspots

## Requirements

### Requirement: runGraphHotspots orchestration

#### Scenario: Hotspots ranked with transient provider

- **GIVEN** an indexed project graph
- **WHEN** `runGraphHotspots(ctx)` is executed without a caller-provided provider
- **THEN** a transient provider is opened and `computeHotspots` is invoked
- **AND** `totalSymbols`, `entries`, and `omittedCounts` are returned
- **AND** the provider is cleanly closed after execution

#### Scenario: Hotspots with caller-owned open provider

- **GIVEN** an open caller-provided `CodeGraphProvider`
- **WHEN** `runGraphHotspots(ctx, { provider })` is executed
- **THEN** computation runs directly on the open provider without closing it

#### Scenario: Entries include projectRelativePath and workspace

- **GIVEN** hotspot results across workspaces
- **WHEN** `runGraphHotspots` returns ranked entries
- **THEN** each entry exposes `projectRelativePath` corresponding to the repository root
- **AND** each entry exposes the owning `workspace` name

#### Scenario: All hotspot options forwarded to provider

- **GIVEN** hotspot options including `kinds`, `workspace`, `excludePaths`, `excludeWorkspaces`, `limit`, `minScore`, `minRisk`, `includeImporterOnly`, `categories`, `includeTests`, and `includeIgnored`
- **WHEN** `runGraphHotspots(ctx, input)` is executed
- **THEN** all options are forwarded to `provider.getHotspots(...)` without modification

#### Scenario: Aliases file and filePath behave identically

- **GIVEN** requests using either `file` or `filePath`
- **WHEN** `runGraphHotspots` is executed
- **THEN** both spellings map to the same `filePath` option on `provider.getHotspots(...)`

### Requirement: Elimination of displayPath

#### Scenario: displayPath is omitted from hotspot entries

- **WHEN** `runGraphHotspots` returns ranked entries
- **THEN** no entry contains `displayPath`

### Requirement: Pure path projection

#### Scenario: Hotspot projection uses configuration alone

- **WHEN** hotspot symbol paths are mapped to `projectRelativePath`
- **THEN** mapping derives from workspace code roots without extra provider lookups

### Requirement: No presenter formatting

#### Scenario: Pure structured data returned

- **WHEN** `runGraphHotspots` completes
- **THEN** output is a structured object with no table rendering, terminal padding, or omission notice strings

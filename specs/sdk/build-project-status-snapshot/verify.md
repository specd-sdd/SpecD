# Verification: SDK Build Project Status Snapshot

## Requirements

### Requirement: buildProjectStatusSnapshot orchestration

#### Scenario: Summary only without graph

- **WHEN** `buildProjectStatusSnapshot(ctx, { includeGraph: false })` is called
- **THEN** `kernel.project.getProjectSummary.execute()` is invoked
- **AND** no graph provider is opened
- **AND** `graphHealth` is null

#### Scenario: Graph health included when requested

- **WHEN** `buildProjectStatusSnapshot(ctx, { includeGraph: true })` is called
- **THEN** `withOpenGraphProvider` wraps a `GetGraphHealth` execution
- **AND** workspaces passed to graph health come from `listWorkspaces`

#### Scenario: Graph unavailable returns null without throwing

- **WHEN** `buildProjectStatusSnapshot(ctx, { includeGraph: true })` is called and graph loading fails
- **THEN** `graphHealth` is `null`
- **AND** the function resolves without throwing

#### Scenario: Hotspots included when requested

- **WHEN** `buildProjectStatusSnapshot(ctx, { includeGraph: true, includeHotspots: true })` is called
- **THEN** `hotspots` is populated from `provider.getHotspots()` when available

### Requirement: Result shape stability

#### Scenario: Approvals derived from getConfig

- **GIVEN** config has `approvals.spec: true`
- **WHEN** snapshot is built
- **THEN** `approvals.specEnabled` is `true`

#### Scenario: llmOptimizedContext forwarded

- **GIVEN** config has `llmOptimizedContext: true`
- **WHEN** snapshot is built
- **THEN** result `llmOptimizedContext` is `true`

### Requirement: No presenter formatting

#### Scenario: Returns structured object

- **WHEN** snapshot completes
- **THEN** the result is a plain object with `summary`, `graphHealth`, `approvals`, and `llmOptimizedContext` fields
- **AND** no formatted text output is produced

# Verification: GetGraphHealth

## Requirements

### Requirement: Returns enriched graph health

#### Scenario: Fresh graph with matching fingerprint

- **GIVEN** an opened provider with indexed data at the current VCS ref and matching derivation fingerprint
- **WHEN** `GetGraphHealth.execute()` is called with workspaces and `codeGraphVersion`
- **THEN** the result includes all `GraphStatistics` fields
- **AND** `stale` is `false`
- **AND** `fingerprintMismatch` is `false`

#### Scenario: Unknown staleness when no indexed ref

- **GIVEN** statistics with `lastIndexedRef: null`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `stale` is `null`

### Requirement: Provider-owned availability and error propagation

#### Scenario: Busy provider error propagates unchanged

- **GIVEN** the provider reports `GRAPH_BUSY` from `getStatistics()`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** the same busy error propagates to the caller

#### Scenario: Stale provider error propagates unchanged

- **GIVEN** the provider reports `GRAPH_PROVIDER_STALE` from `getStatistics()`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** the same stale-provider error propagates to the caller

### Requirement: Computes VCS staleness

#### Scenario: Stale by VCS ref drift

- **GIVEN** `lastIndexedRef` differs from the current VCS ref
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `stale` is `true`
- **AND** `currentRef` matches the adapter ref

### Requirement: Computes derivation fingerprint mismatch

#### Scenario: Mismatch detected

- **GIVEN** stored `graphFingerprint` differs from current workspace layout
- **WHEN** workspaces and `codeGraphVersion` are provided
- **THEN** `fingerprintMismatch` is `true`

#### Scenario: Comparison skipped without workspaces

- **GIVEN** `workspaces` is omitted
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `fingerprintMismatch` is `null`

### Requirement: Accepts open provider and project inputs

#### Scenario: Does not open or close provider

- **GIVEN** a mock provider with spied `open` and `close`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `open` and `close` are not called

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createGetGraphHealth()` is called twice
- **THEN** each call returns a new `GetGraphHealth` instance with no captured config

### Requirement: Content freshness and coverage result

#### Scenario: Health makes absence trust explicit

- **GIVEN** one indexed file is dirty, one excluded, and one parse-failed
- **WHEN** health is requested
- **THEN** structured fields and reason codes distinguish all three from current complete coverage
- **AND** no indexing or mutation occurs

#### Scenario: Terminal non-code outcomes do not poison aggregate health

- **GIVEN** every considered target is indexed, excluded, or explicitly unsupported
- **WHEN** health is requested
- **THEN** excluded and unsupported counts and reasons remain queryable
- **AND** those terminal outcomes alone do not make aggregate coverage incomplete or emit incomplete-coverage health reasons

#### Scenario: Content inspection failure remains unknown

- **GIVEN** discovery, stat, read, or hashing fails for a visible indexed resource
- **WHEN** health cannot otherwise prove that resource stale
- **THEN** the affected scope and aggregate evidence remain unknown
- **AND** no stale latch is set and no dirty-content mismatch is invented

### Requirement: Indexed-content integrity assessment

#### Scenario: Retained indexed coverage over an empty graph is inconsistent

- **GIVEN** coverage records claim successfully indexed code inputs
- **AND** the corresponding file and symbol graph contents are absent
- **WHEN** graph health is computed
- **THEN** `contentFresh` and `coverageComplete` are false
- **AND** aggregate state is not `current`
- **AND** reasons include `GRAPH_CONTENT_INCONSISTENT`

#### Scenario: Complete generation remains current

- **GIVEN** every successfully indexed coverage record has its expected persisted file or document node
- **AND** VCS, fingerprint, generation, and schema checks are current
- **WHEN** graph health is computed
- **THEN** the integrity assessment adds no inconsistency reason
- **AND** existing health inputs may produce aggregate state `current`

#### Scenario: Unsupported inputs do not require code nodes

- **GIVEN** a discovered textual input has coverage status `unsupported` with reason `no-language-adapter`
- **AND** it has no persisted code file or symbol node
- **WHEN** graph health is computed
- **THEN** that absence alone does not add `GRAPH_CONTENT_INCONSISTENT`
- **AND** the unsupported coverage reason remains visible

#### Scenario: Integrity failure does not mutate or repair storage

- **GIVEN** health detects inconsistent coverage and graph contents
- **WHEN** the use case returns diagnostics
- **THEN** it does not clear, recreate, index, open, or close the provider

### Requirement: Aggregate and workspace health projection

#### Scenario: Aggregate precedence and workspace projection are stable

- **GIVEN** current, unknown, and stale workspaces
- **WHEN** graph health is projected
- **THEN** aggregate state is stale
- **AND** every workspace appears in deterministic structured output with mode, latch, state, and reasons
- **AND** text shows aggregate health plus only non-current workspaces

#### Scenario: Aggregate latch avoids reassessment

- **GIVEN** `knownStaleSinceLastIndex` is true globally
- **WHEN** health is requested
- **THEN** it returns stale without rescanning scopes or resources
- **AND** no absolute workspace or VCS root is exposed

### Requirement: Efficient scope assessment

#### Scenario: VCS group filters visibility before filesystem work

- **GIVEN** several workspaces share a repository whose diff contains only excluded paths
- **WHEN** health is assessed
- **THEN** one adapter evaluation is shared and effective graph visibility removes every path before stat or hash
- **AND** no stale latch changes

#### Scenario: Filesystem assessment hashes only changed observations

- **GIVEN** a non-VCS workspace with many unchanged files and one stamp mismatch
- **WHEN** health is assessed
- **THEN** matching mtime/size observations avoid content reads
- **AND** equal content refreshes metadata
- **AND** assessment stops at the first proven stale mismatch

#### Scenario: Health never walks all symbols

- **WHEN** efficient scope assessment runs
- **THEN** it does not inspect every symbol
- **AND** it does not invoke exact-resource freshness for the entire graph

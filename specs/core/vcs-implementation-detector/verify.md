# Verification: core:vcs-implementation-detector

## Requirements

### Requirement: Implements the detector port

#### Scenario: VCS-backed detector satisfies detector contract

- **WHEN** the VCS-backed detector is used through the `ImplementationDetector` port
- **THEN** callers receive project-relative modified-file candidates through the abstract detector interface

### Requirement: Uses the VCS adapter port

#### Scenario: Detector delegates modified-file enumeration to VcsAdapter

- **GIVEN** a VCS adapter implementation is available
- **WHEN** the detector is asked for modified files
- **THEN** it queries the VCS adapter port instead of running VCS-specific logic inline

### Requirement: Resolves the historical implementation baseline

#### Scenario: Detector uses the first implementing timestamp to resolve baseline

- **GIVEN** a change first entered `implementing` at a known timestamp
- **AND** the VCS adapter can resolve a historical revision for that timestamp
- **WHEN** the detector is asked for modified files
- **THEN** it calls `refAt(...)` with that timestamp
- **AND** it uses the returned revision as the baseline for `modifiedFiles(...)`

#### Scenario: Detector falls back when historical baseline cannot be resolved

- **GIVEN** the VCS adapter cannot resolve a historical revision for the implementing timestamp
- **WHEN** the detector is asked for modified files
- **THEN** it falls back to `ref()`
- **AND** it still returns project-relative candidates instead of failing

### Requirement: Modified-file candidate mapping

#### Scenario: Returned candidates are normalized from VCS output

- **GIVEN** the adapter returns repository-relative changed files
- **WHEN** the detector maps them into detector output
- **THEN** the detector returns forward-slash-normalized project-relative paths

### Requirement: No workspace normalization

#### Scenario: Detector does not emit workspace-prefixed identities

- **WHEN** the VCS-backed detector returns candidate files
- **THEN** the returned values are not normalized to `workspace:path`
- **AND** workspace validation remains deferred to archive-time materialization

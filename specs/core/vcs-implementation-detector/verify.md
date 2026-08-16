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

#### Scenario: Repository paths are rebased to the nested project

- **GIVEN** the configured project root is nested below the VCS repository root
- **AND** the adapter returns changed paths inside and outside that project
- **WHEN** the detector maps candidates
- **THEN** inside paths are rebased to normalized project-relative paths
- **AND** outside paths are omitted

#### Scenario: Rename and deletion candidates survive mapping

- **GIVEN** both sides of a rename and a deleted path are inside the project
- **WHEN** candidates are mapped
- **THEN** all paths remain present, deduplicated, and sorted

#### Scenario: Detector separates generic exclusions from graph policy

- **GIVEN** generic implementation exclusions were supplied by the caller
- **WHEN** modified candidates are rebased and mapped
- **THEN** those generic exclusions MAY remove matching implementation candidates
- **AND** no Code Graph configuration, allowed-path, channel, default-exclusion, or graph-specific visibility policy is loaded or inferred
- **AND** no graph freshness fingerprint is derived

### Requirement: No workspace normalization

#### Scenario: Detector does not emit workspace-prefixed identities

- **WHEN** the VCS-backed detector returns candidate files
- **THEN** the returned values are not normalized to `workspace:path`
- **AND** workspace validation remains deferred to archive-time materialization

#### Scenario: Detector remains workspace-agnostic

- **GIVEN** repository-relative modified paths and caller-provided implementation exclusions
- **WHEN** the detector maps candidates
- **THEN** it rebases to the project root and applies only the generic implementation exclusions
- **AND** it performs no workspace discovery or Code Graph visibility evaluation

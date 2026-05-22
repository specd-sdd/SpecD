# Verification: core:implementation-detector-port

## Requirements

### Requirement: Detector interface

#### Scenario: Detector returns normalized project-relative candidates

- **WHEN** `detectModifiedFiles(change)` is called
- **THEN** every returned path is relative to the project root
- **AND** path separators are normalized to forward slashes

#### Scenario: Callers provide change context instead of raw baseline refs

- **GIVEN** a lifecycle use case wants to refresh implementation tracking
- **WHEN** it calls the detector port
- **THEN** it passes the change context itself
- **AND** it does not compute or pass a raw VCS baseline reference

### Requirement: Targeted lifecycle use

#### Scenario: Lifecycle use case invokes detector instead of Change entity

- **GIVEN** implementation refresh is triggered from a lifecycle entry point
- **WHEN** modified files are requested
- **THEN** the lifecycle use case calls the detector port
- **AND** the `Change` entity itself does not perform detection

### Requirement: Backend independence

#### Scenario: Alternate detector backend can satisfy the same contract

- **GIVEN** a non-VCS implementation of the detector port
- **WHEN** it returns changed files
- **THEN** consumers can treat the result exactly like the VCS-backed detector result
- **AND** no caller depends on backend-specific behavior

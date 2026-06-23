# Verification: core:implementation-detector-port

## Requirements

### Requirement: Detector interface

#### Scenario: Detector returns normalized project-relative candidates

- **WHEN** `detectModifiedFiles(change, options?)` is called
- **THEN** every returned path is relative to the project root
- **AND** path separators are normalized to forward slashes

#### Scenario: Detector excludes configured internal paths

- **GIVEN** `options.excludePaths` contains project-relative internal directory prefixes
- **WHEN** `detectModifiedFiles(change, options?)` returns candidate files
- **THEN** no returned path falls under the excluded prefixes

#### Scenario: Callers provide change context instead of raw baseline refs

- **GIVEN** `RefreshImplementationTracking` needs candidate paths
- **WHEN** it calls the detector port
- **THEN** it passes the change context itself
- **AND** it does not compute or pass a raw VCS baseline reference

### Requirement: Targeted lifecycle use

#### Scenario: Refresh use case invokes detector instead of Change entity

- **GIVEN** `RefreshImplementationTracking` runs with the historical implementing guard satisfied
- **WHEN** modified files are requested
- **THEN** `RefreshImplementationTracking` calls the detector port
- **AND** the call includes any internal-path exclusions needed for the active project
- **AND** the `Change` entity itself does not perform detection

#### Scenario: Read and transition use cases do not invoke detector

- **GIVEN** `GetStatus`, `TransitionChange`, or `CompileContext` executes
- **WHEN** implementation tracking is needed
- **THEN** those use cases do not call `ImplementationDetector` directly

### Requirement: Backend independence

#### Scenario: Alternate detector backend can satisfy the same contract

- **GIVEN** a non-VCS implementation of the detector port
- **WHEN** it returns changed files
- **THEN** consumers can treat the result exactly like the VCS-backed detector result
- **AND** no caller depends on backend-specific behavior

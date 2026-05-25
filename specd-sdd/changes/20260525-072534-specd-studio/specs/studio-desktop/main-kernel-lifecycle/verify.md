# Verification: Main Kernel Lifecycle

## Requirements

### Requirement: one kernel per open local project

#### Scenario: Opening folder constructs kernel

- **WHEN** user opens directory with `specd.yaml`
- **THEN** main process creates one `Kernel`
- **AND** IPC serves port methods

#### Scenario: Second open reuses until switch

- **GIVEN** project already open
- **WHEN** user triggers refresh
- **THEN** same kernel instance serves requests
- **AND** no duplicate kernels

#### Scenario: Invalid folder shows error

- **WHEN** user picks directory without `specd.yaml`
- **THEN** open is rejected
- **AND** no kernel is created

### Requirement: project switch tears down kernel and graph state

#### Scenario: Opening new folder disposes old kernel

- **GIVEN** project A is open
- **WHEN** user opens project B folder
- **THEN** kernel A disposed
- **AND** kernel B serves IPC

#### Scenario: Graph provider reset on switch

- **WHEN** project switch completes
- **THEN** in-memory graph cache cleared
- **AND** status reflects new project paths

#### Scenario: In-flight IPC cancelled on switch

- **GIVEN** long IPC call running for project A
- **WHEN** switch to B starts
- **THEN** A requests rejected or aborted
- **AND** B calls do not read A paths

# Verification: RefreshImplementationTracking

## Requirements

### Requirement: Input contract

#### Scenario: Execute accepts change name

- **WHEN** `RefreshImplementationTracking.execute({ name })` is called with an existing change
- **THEN** the use case loads that change by name

### Requirement: Historical implementing guard

#### Scenario: Guard satisfied triggers detector

- **GIVEN** a change has entered `implementing` at least once in its history
- **WHEN** `RefreshImplementationTracking.execute()` runs
- **THEN** it invokes `ImplementationDetector.detectModifiedFiles`

#### Scenario: Guard not satisfied skips detector

- **GIVEN** a change has never entered `implementing`
- **WHEN** `RefreshImplementationTracking.execute()` runs
- **THEN** it does not invoke `ImplementationDetector`
- **AND** it does not add tracked implementation files

### Requirement: Detection merge semantics

#### Scenario: New detected paths become open tracked files

- **GIVEN** detection returns `packages/core/src/foo.ts`
- **AND** that path is not yet tracked
- **WHEN** refresh completes
- **THEN** the change includes `packages/core/src/foo.ts` with review state `open`

#### Scenario: Existing tracked entries are preserved

- **GIVEN** a tracked file already exists with review state `resolved`
- **WHEN** detection returns the same path again
- **THEN** the tracked entry keeps its existing review state

### Requirement: Persistence

#### Scenario: Refresh persists through ChangeRepository.mutate

- **GIVEN** detection adds a new tracked file
- **WHEN** refresh completes
- **THEN** a subsequent `ChangeRepository.get` returns the new tracked file

### Requirement: Result projection

#### Scenario: Result returns implementation tracking projection

- **WHEN** refresh completes successfully
- **THEN** the result includes `trackedFiles` and `links` from the persisted change

### Requirement: Change must exist

#### Scenario: Unknown change throws ChangeNotFoundError

- **WHEN** `RefreshImplementationTracking.execute({ name: 'missing' })` is called
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Constructor dependencies

#### Scenario: Use case receives repository and detector

- **GIVEN** `RefreshImplementationTracking` is assembled by the kernel
- **WHEN** the use case is constructed
- **THEN** it receives `ChangeRepository` and `ImplementationDetector`

### Requirement: Delivery-agnostic boundary

#### Scenario: Use case spec does not name delivery adapters

- **WHEN** the `core:refresh-implementation-tracking` spec is reviewed
- **THEN** its requirements do not reference CLI commands, MCP servers, or filesystem watchers

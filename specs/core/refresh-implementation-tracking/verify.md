# Verification: RefreshImplementationTracking

## Requirements

### Requirement: Input contract

#### Scenario: Execute accepts change name

- **WHEN** `RefreshImplementationTracking.execute({ name })` is called with an existing change
- **THEN** the use case loads that change by name

### Requirement: Default orchestration by host use cases

#### Scenario: GetStatus delegates to RefreshImplementationTracking

- **GIVEN** `GetStatus` is configured with a `RefreshImplementationTracking` collaborator
- **WHEN** `GetStatus` performs a default active-change status load
- **THEN** it calls `RefreshImplementationTracking.execute({ name })` rather than `ImplementationDetector` directly

#### Scenario: TransitionChange delegates to RefreshImplementationTracking

- **GIVEN** `TransitionChange` is configured with a `RefreshImplementationTracking` collaborator
- **WHEN** `TransitionChange` performs a default active-change transition
- **THEN** it calls `RefreshImplementationTracking.execute({ name })` rather than `ImplementationDetector` directly

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

### Requirement: Deletion and removal semantics

#### Scenario: Missing tracked files are marked removed

- **GIVEN** `packages/core/src/deleted.ts` is tracked as `open`
- **AND** the file no longer exists on disk
- **WHEN** refresh runs
- **THEN** its state transitions to `removed`

#### Scenario: Links for missing files are cleaned up

- **GIVEN** `packages/core/src/deleted.ts` is tracked as `open`
- **AND** a confirmed link exists for this file
- **AND** the file no longer exists on disk
- **WHEN** refresh runs
- **THEN** the link is removed from `implementationLinks`

### Requirement: Resurrections and re-appearances

#### Scenario: Removed file reappearing via detector becomes open

- **GIVEN** `packages/core/src/resurrected.ts` is tracked as `removed`
- **AND** the detector identifies it as modified
- **WHEN** refresh runs
- **THEN** its state transitions back to `open`

#### Scenario: Removed file found on disk becomes open

- **GIVEN** `packages/core/src/resurrected.ts` is tracked as `removed`
- **AND** the file exists on disk during the existence check
- **WHEN** refresh runs
- **THEN** its state transitions back to `open`

### Requirement: Internal directory filtering

#### Scenario: Use case excludes internal repository paths

- **GIVEN** `ChangeRepository` returns `changes/` and `drafts/` as internal paths
- **AND** `ArchiveRepository` returns `archive/`
- **WHEN** refresh runs
- **THEN** it passes these paths as `excludePaths` to the detector

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

#### Scenario: Use case receives repositories and detector

- **GIVEN** `RefreshImplementationTracking` is assembled by the kernel
- **WHEN** the use case is constructed
- **THEN** it receives `ChangeRepository`, `ArchiveRepository`, and `ImplementationDetector`

### Requirement: Delivery-agnostic boundary

#### Scenario: Use case spec does not name delivery adapters

- **WHEN** the `core:refresh-implementation-tracking` spec is reviewed
- **THEN** its requirements do not reference CLI commands, MCP servers, or filesystem watchers

### Requirement: Config-based factory delegates through resolveRefreshImplementationTrackingDeps

#### Scenario: createRefreshImplementationTracking config form derives RefreshImplementationTrackingDeps through resolveRefreshImplementationTrackingDeps

- **WHEN** `createRefreshImplementationTracking(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `RefreshImplementationTrackingDeps` through `resolveRefreshImplementationTrackingDeps(resolver)`
- **AND** `resolveRefreshImplementationTrackingDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `archives: ArchiveRepository`
- `implementationDetector: ImplementationDetector`
- `files: FileReader`
- `projectRoot: string`
- **AND** the factory delegates to canonical `createRefreshImplementationTracking(deps)`

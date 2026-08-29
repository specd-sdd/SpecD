# Verification: UpdateImplementationTracking

## Requirements

### Requirement: Input contract

#### Scenario: Execute accepts implementation-tracking mutation input

- **WHEN** `UpdateImplementationTracking.execute(...)` is called
- **THEN** it accepts `name`, `action`, and `file`
- **AND** it optionally accepts `specId` and `symbols` for link mutations

### Requirement: Add mutation creates or enriches implementation links

#### Scenario: Add requires file existence and opens tracking when needed

- **GIVEN** a change exists and the target file exists on disk
- **WHEN** `action = add` is executed for an untracked file
- **THEN** a confirmed implementation link is created or enriched
- **AND** the file becomes tracked with review state `open`

#### Scenario: Add allows specId declared in change or existing in canonical repository

- **GIVEN** a change exists with declared specIds and access to workspace spec repositories
- **WHEN** `action = add` is executed with a `specId` present in `change.specIds` or present in `SpecRepository`
- **THEN** the implementation link is created successfully

#### Scenario: Add throws SpecNotFoundError when specId is absent from change and repository

- **GIVEN** a change exists with a declared specId list
- **WHEN** `action = add` is executed with a `specId` that is not in `change.specIds` and not found in `SpecRepository`
- **THEN** the use case throws `SpecNotFoundError`

#### Scenario: Batch add with invalid specId fails atomically and leaves change untouched

- **GIVEN** an atomic batch add request with multiple files and an invalid `specId`
- **WHEN** `action = add` is executed
- **THEN** `SpecNotFoundError` is thrown
- **AND** no files from the batch are added to `trackedImplementationFiles` or `implementationLinks`

### Requirement: Remove mutation removes implementation links

#### Scenario: Remove with symbols deletes only those refinements

- **GIVEN** a confirmed `specId + file` link has multiple symbol refinements
- **WHEN** `action = remove` is executed with one symbol
- **THEN** only that symbol refinement is removed

### Requirement: Resolve mutation closes tracked-file review

#### Scenario: Resolve requires tracked existing file

- **GIVEN** a tracked file exists on disk
- **WHEN** `action = resolve` is executed
- **THEN** the tracked file moves to `resolved`

### Requirement: Unresolve mutation reopens tracked-file review

#### Scenario: Unresolve reopens resolved file

- **GIVEN** a tracked file exists on disk in `resolved` state
- **WHEN** `action = unresolve` is executed
- **THEN** the tracked file moves to `open`

#### Scenario: Unresolve refuses removed file

- **GIVEN** a tracked file is in `removed` state
- **WHEN** `action = unresolve` is executed
- **THEN** the use case throws `ImplementationFileNotFoundError`

### Requirement: Ignore mutation preserves tracked history

#### Scenario: Ignore preserves confirmed links for tracked file

- **GIVEN** a tracked file has confirmed implementation links
- **WHEN** `action = ignore` is executed
- **THEN** the file moves to `ignored`
- **AND** the confirmed links remain present

### Requirement: Start mutation activates implementation tracking

#### Scenario: Start mutation activates tracking on change without requiring file

- **GIVEN** an existing change where implementation tracking is inactive
- **WHEN** calling `UpdateImplementationTracking.execute({ name, action: 'start' })`
- **THEN** `isImplementationTrackingActive` becomes `true` on the change
- **AND** the updated implementation tracking projection is returned
- **AND** subsequent `start` calls succeed idempotently

### Requirement: Change must exist

#### Scenario: Unknown change throws ChangeNotFoundError

- **WHEN** `UpdateImplementationTracking.execute({ name: "missing", ... })` is called
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Missing-file validation uses typed errors

#### Scenario: Missing file throws ImplementationFileNotFoundError

- **WHEN** a file-required mutation targets a missing or invalid file
- **THEN** the use case throws `ImplementationFileNotFoundError`

### Requirement: Persistence and result projection

#### Scenario: Mutation persists and returns implementation projection

- **WHEN** a mutation succeeds
- **THEN** it persists through `ChangeRepository.mutate`
- **AND** the result includes the resulting `ImplementationTrackingProjection`

### Requirement: Config-based factory delegates through resolveUpdateImplementationTrackingDeps

#### Scenario: createUpdateImplementationTracking config form derives UpdateImplementationTrackingDeps through resolveUpdateImplementationTrackingDeps

- **WHEN** `createUpdateImplementationTracking(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `UpdateImplementationTrackingDeps` through `resolveUpdateImplementationTrackingDeps(resolver)`
- **AND** `resolveUpdateImplementationTrackingDeps(resolver)` resolves:
  - `changes: ChangeRepository`
  - `files: FileReader`
  - `projectRoot: string`
  - `specRepositories?: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createUpdateImplementationTracking(deps)`

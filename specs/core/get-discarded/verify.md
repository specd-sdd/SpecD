# Verification: GetDiscarded

## Requirements

### Requirement: Input contract

#### Scenario: execute accepts GetDiscardedInput with name

- **WHEN** `GetDiscarded.execute({ name: 'old-experiment' })` is called
- **THEN** it accepts the input without type errors

#### Scenario: execute rejects missing name at type level

- **WHEN** application code constructs `GetDiscardedInput`
- **THEN** `name` is a required string field

#### Scenario: execute propagates repository errors

- **GIVEN** `ChangeRepository.getDiscarded` throws an unexpected storage error
- **WHEN** `GetDiscarded.execute({ name })` is called
- **THEN** the same error propagates to the caller

### Requirement: Resolution

#### Scenario: Discarded change returns view

- **GIVEN** a change exists only under `discarded/` named `old-experiment` discarded with reason `obsolete`
- **WHEN** `GetDiscarded.execute({ name: 'old-experiment' })` is called
- **THEN** it returns `{ view }` where `view` is a `DiscardedChangeView`
- **AND** `view.discardReason` is `obsolete`

#### Scenario: Active-only name is not found

- **GIVEN** a change exists only under `changes/`
- **WHEN** `GetDiscarded.execute({ name })` is called
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Drafted-only name is not found

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `GetDiscarded.execute({ name })` is called
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Discarded-only name does not fall back to get or getDraft

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `GetDiscarded.execute({ name })` is called
- **THEN** `getDiscarded(name)` is invoked
- **AND** `get(name)` and `getDraft(name)` are not used to return a load result

#### Scenario: Missing name throws

- **WHEN** `GetDiscarded.execute({ name: 'does-not-exist' })` is called
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Read-only

#### Scenario: No repository mutation on success

- **GIVEN** a discarded change exists
- **WHEN** `GetDiscarded.execute({ name })` completes successfully
- **THEN** `ChangeRepository.mutate` was not called
- **AND** `ChangeRepository.mutateDraft` was not called

#### Scenario: No save or saveArtifact on success

- **GIVEN** a discarded change exists
- **WHEN** `GetDiscarded.execute({ name })` completes successfully
- **THEN** `ChangeRepository.save` was not called
- **AND** `ChangeRepository.saveArtifact` was not called

#### Scenario: View returned is not a mutable Change

- **GIVEN** a discarded change exists
- **WHEN** `GetDiscarded.execute({ name })` returns `{ view }`
- **THEN** `view` is not an instance of domain `Change`

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `GetDiscarded` is constructed without a `ChangeRepository`
- **THEN** construction fails or `execute` cannot run

#### Scenario: Does not require ActorResolver

- **WHEN** `GetDiscarded` is instantiated
- **THEN** only `ChangeRepository` is required in its constructor

#### Scenario: Does not require SchemaProvider

- **WHEN** `GetDiscarded.execute` runs
- **THEN** `SchemaProvider` is not consulted

### Requirement: Config-based factory delegates through resolveGetDiscardedDeps

#### Scenario: createGetDiscarded config form derives GetDiscardedDeps through resolveGetDiscardedDeps

- **WHEN** `createGetDiscarded(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetDiscardedDeps` through `resolveGetDiscardedDeps(resolver)`
- **AND** `resolveGetDiscardedDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createGetDiscarded(deps)`

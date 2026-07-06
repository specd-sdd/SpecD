# Verification: GetDraft

## Requirements

### Requirement: Input contract

#### Scenario: execute accepts GetDraftInput with name

- **WHEN** `GetDraft.execute({ name: 'parked-feature' })` is called
- **THEN** it accepts the input without type errors

#### Scenario: execute rejects missing name at type level

- **WHEN** application code constructs `GetDraftInput`
- **THEN** `name` is a required string field

#### Scenario: execute propagates repository errors

- **GIVEN** `ChangeRepository.getDraft` throws an unexpected storage error
- **WHEN** `GetDraft.execute({ name })` is called
- **THEN** the same error propagates to the caller

### Requirement: Resolution

#### Scenario: Drafted change returns view

- **GIVEN** a change exists only under `drafts/` named `parked-feature`
- **WHEN** `GetDraft.execute({ name: 'parked-feature' })` is called
- **THEN** it returns `{ view }` where `view` is a `DraftedChangeView`
- **AND** `view.name` is `parked-feature`
- **AND** `view.isDrafted === true`

#### Scenario: Active-only name is not found

- **GIVEN** a change exists only under `changes/` with the same slug
- **WHEN** `GetDraft.execute({ name })` is called
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Drafted-only name does not fall back to get

- **GIVEN** a change exists only under `drafts/`
- **AND** `ChangeRepository.get(name)` returns `null`
- **WHEN** `GetDraft.execute({ name })` is called
- **THEN** `getDraft(name)` is invoked
- **AND** `get(name)` is not used to synthesize a `Change` return value

#### Scenario: Discarded-only name is not found

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `GetDraft.execute({ name })` is called
- **THEN** it throws `ChangeNotFoundError`

#### Scenario: Missing name throws

- **WHEN** `GetDraft.execute({ name: 'does-not-exist' })` is called and the name exists in none of `changes/`, `drafts/`, or `discarded/`
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Read-only

#### Scenario: No repository mutation on success

- **GIVEN** a drafted change exists
- **WHEN** `GetDraft.execute({ name })` completes successfully
- **THEN** `ChangeRepository.mutate` was not called
- **AND** `ChangeRepository.mutateDraft` was not called
- **AND** `ChangeRepository.save` was not called

#### Scenario: No artifact writes on success

- **GIVEN** a drafted change exists
- **WHEN** `GetDraft.execute({ name })` completes successfully
- **THEN** `ChangeRepository.saveArtifact` was not called

#### Scenario: View returned is not a mutable Change

- **GIVEN** a drafted change exists
- **WHEN** `GetDraft.execute({ name })` returns `{ view }`
- **THEN** `view` is not an instance of domain `Change`

### Requirement: Dependencies

#### Scenario: Uses ChangeRepository port

- **WHEN** `GetDraft` is constructed without a `ChangeRepository`
- **THEN** construction fails or `execute` cannot run

#### Scenario: Does not require ActorResolver

- **WHEN** `GetDraft` is instantiated
- **THEN** only `ChangeRepository` is required in its constructor

#### Scenario: Does not require SchemaProvider

- **WHEN** `GetDraft.execute` runs
- **THEN** `SchemaProvider` is not consulted

### Requirement: Config-based factory delegates through resolveGetDraftDeps

#### Scenario: createGetDraft config form derives GetDraftDeps through resolveGetDraftDeps

- **WHEN** `createGetDraft(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetDraftDeps` through `resolveGetDraftDeps(resolver)`
- **AND** `resolveGetDraftDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createGetDraft(deps)`

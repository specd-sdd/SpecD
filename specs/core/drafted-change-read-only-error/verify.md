# Verification: DraftedChangeReadOnlyError

## Requirements

### Requirement: Error type

#### Scenario: Extends DomainError

- **WHEN** `DraftedChangeReadOnlyError` is constructed with `changeName` and `operation`
- **THEN** it is an instance of `DomainError`

#### Scenario: Is throwable and catchable as DomainError

- **WHEN** `save` throws `DraftedChangeReadOnlyError`
- **THEN** `catch (err)` with `DomainError` type guard succeeds

#### Scenario: Distinct from ChangeNotFoundError

- **WHEN** `save` throws for a drafted change outside `mutateDraft`
- **THEN** the error is not `ChangeNotFoundError`

### Requirement: When thrown

#### Scenario: save on drafted change throws

- **GIVEN** a persisted change with `isDrafted === true` outside an active `mutateDraft` window
- **WHEN** `ChangeRepository.save(change)` is called
- **THEN** `DraftedChangeReadOnlyError` is thrown

#### Scenario: saveArtifact on drafted change throws

- **GIVEN** a persisted change with `isDrafted === true`
- **WHEN** `ChangeRepository.saveArtifact(change, artifact)` is called outside `mutateDraft`
- **THEN** `DraftedChangeReadOnlyError` is thrown before any filesystem write

#### Scenario: mutateDraft does not throw read-only error on success path

- **GIVEN** a drafted change exists under `drafts/`
- **WHEN** `RestoreChange.execute` completes successfully
- **THEN** `DraftedChangeReadOnlyError` is not thrown

#### Scenario: save allowed inside mutateDraft callback

- **GIVEN** `mutateDraft(name, fn)` is executing its callback for a drafted change
- **WHEN** the callback triggers an internal `save(change)` for that same name
- **THEN** `DraftedChangeReadOnlyError` is not thrown

### Requirement: Payload

#### Scenario: Error includes change name and operation for save

- **WHEN** `save` throws `DraftedChangeReadOnlyError` for change `parked-feature`
- **THEN** `changeName === 'parked-feature'`
- **AND** `operation` identifies `save` or equivalent

#### Scenario: Error includes operation for saveArtifact

- **WHEN** `saveArtifact` throws `DraftedChangeReadOnlyError`
- **THEN** `operation` identifies `saveArtifact` or equivalent

#### Scenario: Message uses drafted terminology

- **WHEN** `DraftedChangeReadOnlyError` is thrown
- **THEN** `message` mentions draft or drafted
- **AND** `message` does not use the term shelved

### Requirement: Error code

#### Scenario: Stable code is DRAFTED_CHANGE_READ_ONLY

- **WHEN** `DraftedChangeReadOnlyError` is thrown
- **THEN** `code === 'DRAFTED_CHANGE_READ_ONLY'`

#### Scenario: CLI maps code to stderr guidance

- **GIVEN** CLI error handling is wired for domain errors
- **WHEN** a command surfaces `DraftedChangeReadOnlyError`
- **THEN** stderr explains the change is drafted and must be restored first

#### Scenario: Code is stable across save and saveArtifact

- **WHEN** `save` and `saveArtifact` each throw for the same drafted change
- **THEN** both errors share the same `code` value

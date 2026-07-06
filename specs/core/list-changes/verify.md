# Verification: ListChanges

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListChanges` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

### Requirement: Returns all active changes

#### Scenario: Multiple active changes exist

- **GIVEN** the repository contains three active changes created in order: `alpha`, `beta`, `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains all three changes in creation order: `alpha`, `beta`, `gamma`

#### Scenario: Drafted and discarded changes are excluded

- **GIVEN** the repository contains active change `alpha`, drafted change `beta`, and discarded change `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains only `alpha`

### Requirement: Returns Change entities without content

#### Scenario: Changes have artifact state but no content

- **WHEN** `execute()` returns a list of changes
- **THEN** each `Change` has its artifact map populated with status and validated hashes
- **AND** no artifact file content is loaded

### Requirement: Returns an empty array when no active changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

#### Scenario: All changes are drafted or discarded

- **GIVEN** the repository contains only drafted and discarded changes
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

### Requirement: Config-based factory preserves complete change repository bootstrap

#### Scenario: Config-wired active listing preserves artifact-type repository semantics

- **GIVEN** `createListChanges(config)` initializes a `ChangeRepository` from `SpecdConfig`
- **WHEN** `ListChanges.execute()` reads active changes through that repository
- **THEN** artifact states are derived with complete artifact-type and spec-existence bootstrap semantics
- **AND** the config-based factory does not expose a weaker change repository variant

### Requirement: Config-based factory delegates through resolveListChangesDeps

#### Scenario: createListChanges config form derives ListChangesDeps through resolveListChangesDeps

- **WHEN** `createListChanges(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListChangesDeps` through `resolveListChangesDeps(resolver)`
- **AND** `resolveListChangesDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createListChanges(deps)`

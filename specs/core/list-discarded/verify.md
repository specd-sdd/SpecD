# Verification: ListDiscarded

## Requirements

### Requirement: Constructor accepts a ChangeRepository

#### Scenario: Constructor accepts ChangeRepository

- **WHEN** `ListDiscarded` is instantiated
- **THEN** it requires a `ChangeRepository` in its constructor

### Requirement: Returns all discarded changes

#### Scenario: Multiple discarded changes exist

- **GIVEN** the repository contains three discarded changes created in order: `alpha`, `beta`, `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains all three changes in creation order: `alpha`, `beta`, `gamma`

#### Scenario: Active and drafted changes are excluded

- **GIVEN** the repository contains discarded change `alpha`, active change `beta`, and drafted change `gamma`
- **WHEN** `execute()` is called
- **THEN** the result contains only `alpha`

### Requirement: Returns DiscardedChangeView without content

#### Scenario: Views have artifact state but no content

- **WHEN** `execute()` returns a list
- **THEN** each entry satisfies `DiscardedChangeView` with `discardReason` from the terminal `discarded` event
- **AND** artifact statuses are populated
- **AND** no artifact file content is loaded

#### Scenario: Views are not Change instances

- **WHEN** `execute()` returns a non-empty list
- **THEN** entries do not expose `transition` or other `Change` mutators

#### Scenario: Empty discarded directory returns empty list

- **GIVEN** no directories exist under `discarded/`
- **WHEN** `ListDiscarded.execute()` is called
- **THEN** it returns an empty array

#### Scenario: Drafted and active changes are excluded

- **GIVEN** `old-experiment` exists only under `discarded/`
- **AND** `parked-feature` exists only under `drafts/`
- **WHEN** `ListDiscarded.execute()` is called
- **THEN** the result contains `old-experiment` only

### Requirement: Returns an empty array when no discarded changes exist

#### Scenario: Repository is empty

- **GIVEN** the repository contains no changes at all
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

#### Scenario: All changes are active or drafted

- **GIVEN** the repository contains only active and drafted changes
- **WHEN** `execute()` is called
- **THEN** the result is an empty array

### Requirement: Config-based factory preserves complete change repository bootstrap

#### Scenario: Config-wired discarded listing preserves artifact-type repository semantics

- **GIVEN** `createListDiscarded(config)` initializes a `ChangeRepository` from `SpecdConfig`
- **WHEN** `ListDiscarded.execute()` reads discarded changes through that repository
- **THEN** discarded artifact states are derived with complete artifact-type and spec-existence bootstrap semantics
- **AND** the config-based factory does not expose a weaker change repository variant

### Requirement: Config-based factory delegates through resolveListDiscardedDeps

#### Scenario: createListDiscarded config form derives ListDiscardedDeps through resolveListDiscardedDeps

- **WHEN** `createListDiscarded(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListDiscardedDeps` through `resolveListDiscardedDeps(resolver)`
- **AND** `resolveListDiscardedDeps(resolver)` resolves:
- `changes: ChangeRepository`
- **AND** the factory delegates to canonical `createListDiscarded(deps)`

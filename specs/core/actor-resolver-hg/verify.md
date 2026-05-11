# Verification: Actor Resolver Hg

## Requirements

### Requirement: Implementation of AutoDetectActorProvider

#### Scenario: Interface satisfaction

- **GIVEN** an `HgActorProvider` instance
- **THEN** it satisfies the `AutoDetectActorProvider` interface

### Requirement: Detection logic

#### Scenario: Repo detected

- **GIVEN** the directory has a `.hg` folder
- **WHEN** `detect()` is called
- **THEN** it returns an `HgActorResolver`

### Requirement: Identity resolution

#### Scenario: Provider field present

- **WHEN** `identity()` resolves
- **THEN** the `provider` field is "hg"

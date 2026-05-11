# Verification: Actor Resolver Svn

## Requirements

### Requirement: Implementation of AutoDetectActorProvider

#### Scenario: Interface satisfaction

- **GIVEN** an `SvnActorProvider` instance
- **THEN** it satisfies the `AutoDetectActorProvider` interface

### Requirement: Detection logic

#### Scenario: Repo detected

- **GIVEN** the directory has a `.svn` folder
- **WHEN** `detect()` is called
- **THEN** it returns an `SvnActorResolver`

### Requirement: Identity resolution

#### Scenario: Provider field present

- **WHEN** `identity()` resolves
- **THEN** the `provider` field is "svn"

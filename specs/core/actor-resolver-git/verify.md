# Verification: Actor Resolver Git

## Requirements

### Requirement: Implementation of AutoDetectActorProvider

#### Scenario: Interface satisfaction

- **GIVEN** a `GitActorProvider` instance
- **THEN** it satisfies the `AutoDetectActorProvider` interface

### Requirement: Detection logic

#### Scenario: Repo detected

- **GIVEN** the directory has a `.git` folder
- **WHEN** `detect()` is called
- **THEN** it returns a `GitActorResolver`

### Requirement: Identity resolution

#### Scenario: Identity from config

- **GIVEN** git user.email is "dev@example.com"
- **WHEN** `identity()` is called
- **THEN** it returns an object with email "dev@example.com"
- **AND** provider is "git"

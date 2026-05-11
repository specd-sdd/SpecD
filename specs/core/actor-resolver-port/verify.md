# Verification: Actor Resolver Port

## Requirements

### Requirement: identity returns the current actor

#### Scenario: Successful identity resolution

- **GIVEN** an identity source with configured name and email
- **WHEN** `identity()` resolves
- **THEN** it returns an object with non-empty `name`
- **AND** the `email` is non-empty for providers with email sources, or empty for providers without
- **AND** it MAY include `provider`, `providerId`, and `metadata`

### Requirement: identity throws when identity is unavailable

#### Scenario: Missing git user.name

- **GIVEN** a git repository where `user.name` is not configured
- **WHEN** `identity()` is called on a `GitActorResolver`
- **THEN** the promise MUST reject with an `Error`

#### Scenario: Missing git user.email

- **GIVEN** a git repository where `user.email` is not configured
- **WHEN** `identity()` is called on a `GitActorResolver`
- **THEN** the promise MUST reject with an `Error`

### Requirement: Null fallback implementation

#### Scenario: NullActorResolver always rejects

- **WHEN** `identity()` is called on a `NullActorResolver`
- **THEN** the promise MUST reject with an `Error` whose message indicates no VCS was detected
- **AND** no I/O or subprocess invocation SHALL occur

### Requirement: Decoupled from VcsAdapter

#### Scenario: ActorResolver does not import VcsAdapter

- **WHEN** examining the imports in `ActorResolver` port declaration
- **THEN** no import of `VcsAdapter` or VCS-related types appears

### Requirement: Interface-only declaration

#### Scenario: ActorResolver is an interface

- **WHEN** `ActorResolver` is declared in the codebase
- **THEN** it is declared as a `type` or `interface`, not an `abstract class`

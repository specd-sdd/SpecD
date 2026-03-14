# Verification: Actor Resolver Port

## Requirements

### Requirement: identity returns the current actor

#### Scenario: Successful identity resolution

- **GIVEN** an identity source with configured name and email
- **WHEN** `identity()` is called
- **THEN** the promise MUST resolve to an `ActorIdentity` with non-empty `name` and `email` strings

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

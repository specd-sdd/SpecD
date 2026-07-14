# Verification: VCS Actor Resolver

## Requirements

### Requirement: Implementation of ActorResolver port

#### Scenario: Interface satisfaction

- **GIVEN** a `VcsActorResolver` instance
- **THEN** it satisfies the `ActorResolver` interface

### Requirement: Constructor receives VcsAdapter

#### Scenario: Instantiation with VcsAdapter

- **GIVEN** a mock `VcsAdapter` instance
- **WHEN** `VcsActorResolver` is constructed with it
- **THEN** construction succeeds

### Requirement: Identity resolution delegates to VcsAdapter

#### Scenario: Successful delegation

- **GIVEN** a mock `VcsAdapter` whose `identity()` resolves to `{ name: "Developer", email: "dev@example.com", provider: "git" }`
- **AND** a `VcsActorResolver` constructed with that mock
- **WHEN** `identity()` is called on the resolver
- **THEN** it calls `identity()` on the mock adapter
- **AND** resolves to `{ name: "Developer", email: "dev@example.com", provider: "git" }`

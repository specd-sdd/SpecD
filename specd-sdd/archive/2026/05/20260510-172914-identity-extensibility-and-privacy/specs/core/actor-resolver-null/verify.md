# Verification: Actor Resolver Null

## Requirements

### Requirement: Identity resolution

#### Scenario: Rejection

- **WHEN** `identity()` is called on a `NullActorResolver`
- **THEN** it rejects with an error

### Requirement: NullAutoDetectActorProvider

#### Scenario: Provider registered with correct name

- **WHEN** the actor provider registry is inspected
- **THEN** a provider named `"null"` exists and implements `AutoDetectActorProvider`

#### Scenario: Provider create() returns NullActorResolver

- **WHEN** `create()` is called on the null provider
- **THEN** it returns an instance of `NullActorResolver` (or something satisfying `ActorResolver`)

#### Scenario: Provider detect() always returns null

- **WHEN** `detect(cwd)` is called on the null provider
- **THEN** it returns `null` for any `cwd`

# Verification: Actor Provider

## Requirements

### Requirement: Base ActorProvider interface

#### Scenario: Selection by name

- **GIVEN** a provider named "custom" is registered
- **WHEN** `actorProvider: "custom"` is configured
- **THEN** the kernel calls `custom.create()`

### Requirement: AutoDetectActorProvider interface

#### Scenario: Automatic detection

- **GIVEN** a provider named "test" implements `AutoDetectActorProvider`
- **AND** it detects the environment
- **WHEN** `detect()` is called
- **THEN** it returns a resolver

# Verification: Domain Api Actor

## Requirements

### Requirement: ApiActor carries stable identity fields

#### Scenario: ApiActor requires id and name

- **WHEN** verifier constructs `ApiActor` for a successful auth
- **THEN** `id` and `name` are non-empty strings
- **AND** `email` is a string (may be empty)

#### Scenario: Roles array is optional

- **GIVEN** provider returns no roles claim
- **WHEN** `ApiActor` is attached to context
- **THEN** `roles` may be omitted
- **AND** handlers still receive id/name/email

#### Scenario: Invalid empty id is rejected at construction

- **WHEN** verifier attempts to build `ApiActor` with empty `id`
- **THEN** construction fails before handler runs
- **AND** request does not reach kernel

### Requirement: ApiActor is immutable on the request

#### Scenario: Handlers cannot mutate ApiActor on context

- **WHEN** handler tries to change `actor.email` after attach
- **THEN** mutation does not affect stored context
- **AND** TypeScript prevents mutation

#### Scenario: Middleware attach is single assignment

- **WHEN** auth middleware completes
- **THEN** `ApiActor` is set once on the context object
- **AND** later middleware reads the same values

#### Scenario: Frozen actor survives presenter chain

- **GIVEN** `ApiActor` attached before handler
- **WHEN** presenter and kernel run
- **THEN** actor fields are unchanged at response time

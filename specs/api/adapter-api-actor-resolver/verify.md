# Verification: Adapter Api Actor Resolver

## Requirements

### Requirement: disabled auth delegates to the kernel ActorResolver

#### Scenario: Disabled auth forwards to bootstrap ActorResolver

- **GIVEN** `api.auth.type` is `disabled`
- **WHEN** HTTP handler resolves actor for a mutating request
- **THEN** adapter `resolve()` delegates to the kernel `ActorResolver`
- **AND** no `Authorization` header is read

#### Scenario: Git-configured actor is used for history

- **GIVEN** git `user.name` and `user.email` are configured
- **WHEN** `SaveChangeArtifact` records history on the request
- **THEN** history `by` matches git identity
- **AND** no synthetic API actor is created

#### Scenario: Same actor for multiple mutations in one request

- **GIVEN** one HTTP request performs two kernel writes
- **WHEN** actor is resolved twice via the adapter
- **THEN** both resolutions return the same identity

### Requirement: authenticated requests map ApiActor to ActorIdentity

#### Scenario: ApiActor maps to history fields

- **GIVEN** request context carries `ApiActor { id, name, email }`
- **WHEN** adapter resolves actor for a mutating call
- **THEN** `ActorIdentity` uses the same `name` and `email`
- **AND** mapping is stable for identical input

#### Scenario: Optional roles are preserved when present

- **GIVEN** `ApiActor` includes `roles: ["admin"]`
- **WHEN** adapter maps to `ActorIdentity`
- **THEN** roles are available to future authorization checks
- **AND** history still uses name/email

#### Scenario: Different ApiActor yields different identity

- **GIVEN** two requests with different `ApiActor` payloads
- **WHEN** each request resolves actor independently
- **THEN** history `by` differs per request
- **AND** adapter does not cache across requests

### Requirement: one resolved actor per HTTP request

#### Scenario: First resolve is cached for the request

- **WHEN** adapter `resolve()` is called twice in the same request scope
- **THEN** both calls return the same object identity or equal fields
- **AND** kernel sees consistent `by`

#### Scenario: New request gets fresh resolution

- **GIVEN** two sequential HTTP requests
- **WHEN** each request resolves actor at handler entry
- **THEN** resolutions are independent
- **AND** no leakage of actor between requests

#### Scenario: Concurrent requests do not share actor cache

- **GIVEN** two in-flight HTTP requests
- **WHEN** each resolves actor concurrently
- **THEN** each resolution uses its own request context
- **AND** identities do not cross streams

# Verification: Adapter Auth Disabled

## Requirements

### Requirement: disabled verifier accepts requests without Authorization

#### Scenario: verify succeeds with no header

- **GIVEN** `api.auth.type` is `disabled`
- **WHEN** `verify(undefined)` is called
- **THEN** verification succeeds
- **AND** Bearer token is not read from headers

#### Scenario: Empty Authorization header is ignored

- **GIVEN** client sends `Authorization:` header
- **WHEN** middleware runs disabled verifier
- **THEN** verification succeeds
- **AND** handler is reached

#### Scenario: Invalid Bearer is not rejected in v1

- **GIVEN** client sends nonsense Bearer token
- **WHEN** middleware runs disabled verifier
- **THEN** request is not rejected with 401 by auth middleware

### Requirement: disabled verifier does not synthesize ApiActor

#### Scenario: No ApiActor is attached from verifier

- **WHEN** disabled verifier completes
- **THEN** verifier does not construct `ApiActor`
- **AND** actor comes from actor-resolver adapter

#### Scenario: History uses git actor

- **GIVEN** git identity configured
- **WHEN** mutating kernel call runs
- **THEN** history `by` matches git user
- **AND** not HTTP header metadata

#### Scenario: Future auth types may attach ApiActor separately

- **GIVEN** disabled remains effective type in v1
- **WHEN** request is processed
- **THEN** only pass-through auth applies
- **AND** registry has no bearer verifier

### Requirement: middleware treats disabled auth as pass-through

#### Scenario: Missing credentials call next()

- **WHEN** request has no Authorization header
- **THEN** middleware calls `next()`
- **AND** response is not 401 from auth

#### Scenario: Handler receives context actor

- **WHEN** handler runs after middleware
- **THEN** `createApiContext` includes actor from resolver
- **AND** mutations pass actor to kernel

#### Scenario: Anonymous local Studio session works

- **GIVEN** `specd ui serve` on loopback
- **WHEN** browser calls mutating route without token
- **THEN** operation succeeds when kernel allows
- **AND** no auth wall at middleware

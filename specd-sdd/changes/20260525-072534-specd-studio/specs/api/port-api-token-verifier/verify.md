# Verification: Port Api Token Verifier

## Requirements

### Requirement: verify accepts optional bearer token

#### Scenario: Missing token allowed when auth disabled

- **GIVEN** effective auth is disabled
- **WHEN** `verify(undefined)` runs
- **THEN** returns success
- **AND** no Authorization required

#### Scenario: Valid bearer accepted when verifier enabled

- **GIVEN** future enabled verifier with test token
- **WHEN** `verify("Bearer test")` runs
- **THEN** returns success
- **AND** `ApiActor` fields populated

#### Scenario: Malformed bearer rejected

- **WHEN** `verify("NotBearer x")` runs
- **THEN** returns failure
- **AND** handler maps to 401 problem+json

### Requirement: port is swappable via registry

#### Scenario: Registry resolves verifier by auth type

- **WHEN** bootstrap calls `resolve(api.auth.type)`
- **THEN** concrete verifier instance returned
- **AND** implements `ApiTokenVerifier`

#### Scenario: Custom verifier can be registered in tests

- **WHEN** test harness registers stub verifier
- **THEN** middleware uses stub
- **AND** production registry unchanged

#### Scenario: Unknown auth type fails at resolve

- **WHEN** config sets unsupported `api.auth.type`
- **THEN** startup error before listening
- **AND** message names supported types

### Requirement: disabled verifier never requires a token

#### Scenario: Mutating route succeeds without Authorization

- **GIVEN** auth disabled
- **WHEN** `POST /v1/changes` without header
- **THEN** HTTP 2xx for valid body
- **AND** actor resolved via git/config

#### Scenario: Spurious bearer is ignored

- **GIVEN** auth disabled
- **WHEN** request includes invalid Bearer token
- **THEN** still succeeds
- **AND** verifier does not reject token

#### Scenario: Health and project echo disabled auth

- **WHEN** `GET /v1/project` runs
- **THEN** `auth.type` is `disabled`
- **AND** no challenge headers required

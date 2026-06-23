# Verification: Middleware Auth

## Requirements

### Requirement: middleware uses startup-resolved verifier only

#### Scenario: Verifier instance is injected at startup

- **WHEN** HTTP server composes middleware
- **THEN** same verifier reference is used
- **AND** middleware does not `new` verifier classes

#### Scenario: Handlers do not select auth implementation

- **WHEN** route handler runs
- **THEN** handler relies on context from middleware
- **AND** no inline auth logic

#### Scenario: Registry resolve happens once

- **GIVEN** server boot calls `resolve`
- **WHEN** second request arrives
- **THEN** middleware does not call `resolve` again

### Requirement: disabled auth never returns 401 for missing credentials

#### Scenario: No Authorization passes through

- **WHEN** Authorization header is absent
- **THEN** status is not 401 from auth middleware
- **AND** handler executes

#### Scenario: Empty Bearer passes through in v1

- **WHEN** `Authorization: Bearer` header is empty
- **THEN** middleware does not return 401
- **AND** kernel may still reject business rules

#### Scenario: Health and project routes stay reachable

- **WHEN** `GET /v1/project` without credentials
- **THEN** HTTP 200
- **AND** payload includes `auth.type`

### Requirement: middleware attaches identity to request context

#### Scenario: Context carries actor after middleware

- **WHEN** mutating handler reads context
- **THEN** `actor` is defined
- **AND** kernel save receives it

#### Scenario: Read-only routes may omit actor requirement

- **WHEN** GET status without mutation
- **THEN** handler still receives context
- **AND** no history write occurs

#### Scenario: Failed verify stops before handler on future types

- **GIVEN** future enforcing auth type configured
- **WHEN** verify fails
- **THEN** handler not run
- **AND** 401 returned — deferred in v1

### Requirement: enforcing auth types return 401 problem+json on failure

#### Scenario: Failed verify returns problem+json

- **GIVEN** future auth requires token
- **AND** token invalid
- **WHEN** middleware `verify` fails
- **THEN** HTTP 401
- **AND** Content-Type is application/problem+json

#### Scenario: Handler chain stops on auth failure

- **WHEN** verify fails under enforcing type
- **THEN** route handler is not invoked
- **AND** response body includes title

#### Scenario: Success attaches identity before handler

- **GIVEN** valid token under enforcing type
- **WHEN** verify succeeds
- **THEN** context includes mapped actor
- **AND** handler runs

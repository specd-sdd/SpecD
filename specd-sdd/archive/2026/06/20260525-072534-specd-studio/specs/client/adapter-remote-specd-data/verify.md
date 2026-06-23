# Verification: Adapter Remote Specd Data

## Requirements

### Requirement: remote adapter composes transport bearer and problem-json layers

#### Scenario: Remote stack wraps transport and parsers

- **WHEN** adapter issues HTTP call
- **THEN** transport normalizes `/v1`
- **AND** problem-json layer wraps fetch

#### Scenario: Bearer layer inserted for remote profile

- **GIVEN** profile has token
- **WHEN** request is sent
- **THEN** Authorization header present
- **AND** bearer adapter does not validate token

#### Scenario: Embedded profile skips bearer wrapper

- **GIVEN** same-origin embedded profile
- **WHEN** request is sent
- **THEN** bearer middleware not active
- **AND** fetch still uses transport

### Requirement: remote adapter normalizes API base URL to /v1

#### Scenario: Remote port calls use /v1 HTTP

- **WHEN** port method runs with a remote base URL configured
- **THEN** request targets `/v1/...`
- **AND** JSON maps into client DTO types

#### Scenario: Remote adapter parses problem+json errors

- **WHEN** server returns 4xx/5xx with problem body
- **THEN** hook receives structured error
- **AND** UI can render status and title

#### Scenario: Transport composes bearer and problem-json layers

- **WHEN** HTTP stack is built for a remote profile
- **THEN** bearer middleware is in the chain
- **AND** problem+json decoder is registered

### Requirement: remote adapter implements the full SpecdDataPort surface

#### Scenario: Every port group has HTTP implementation

- **WHEN** each `SpecdDataPort` method is invoked in integration test
- **THEN** matching `/v1` route is called
- **AND** no NotImplemented methods

#### Scenario: Method signatures match port interfaces

- **WHEN** TypeScript compiles adapters
- **THEN** remote adapter satisfies `SpecdDataPort`
- **AND** desktop local adapter matches shapes

#### Scenario: List changes hits collection routes

- **WHEN** `listChanges()` runs
- **THEN** `GET /v1/changes` is requested
- **AND** DTO parses into sidebar model

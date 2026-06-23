# Verification: Adapter Bearer Auth

## Requirements

### Requirement: bearer header is added only for remote connection profiles

#### Scenario: Remote profile sends Authorization

- **GIVEN** connection profile includes token `sekret`
- **WHEN** HTTP transport issues a request
- **THEN** request headers include `Authorization: Bearer sekret`

#### Scenario: Embedded profile omits Authorization

- **GIVEN** Studio runs embedded same-origin
- **WHEN** HTTP transport issues a request
- **THEN** `Authorization` header is absent

#### Scenario: Empty token omits Authorization header

- **GIVEN** remote profile is selected but token is empty
- **WHEN** HTTP transport issues a request
- **THEN** `Authorization` header is absent
- **AND** request still targets the configured base URL

### Requirement: embedded and desktop local profiles omit Authorization

#### Scenario: Same-origin ui serve omits Authorization

- **GIVEN** Studio uses embedded `specd ui serve` profile
- **WHEN** HTTP transport issues a same-origin request
- **THEN** `Authorization` header is absent

#### Scenario: Desktop local IPC omits Authorization

- **GIVEN** desktop app uses local IPC data adapter
- **WHEN** data call does not go through HTTP transport
- **THEN** bearer adapter is not in the IPC path
- **AND** no `Authorization` header is injected

#### Scenario: Switching to remote profile adds Bearer

- **GIVEN** user selects a remote profile with token configured
- **WHEN** next HTTP request is sent through remote transport
- **THEN** `Authorization: Bearer …` header is present

### Requirement: bearer adapter does not validate tokens

#### Scenario: Adapter does not verify JWT or API key locally

- **WHEN** bearer middleware attaches a token to the request
- **THEN** adapter does not parse or reject the token
- **AND** no local 401 is synthesized

#### Scenario: HTTP 401 is handled by problem-json errors adapter

- **GIVEN** remote API returns HTTP 401 with problem body
- **WHEN** transport receives the response
- **THEN** `client:adapter-problem-json-errors` surfaces the failure
- **AND** bearer adapter does not mask the 401

#### Scenario: Invalid token reaches the server unchanged

- **GIVEN** profile stores token `bad`
- **WHEN** HTTP request is issued
- **THEN** header is `Authorization: Bearer bad`
- **AND** server decides validity; adapter does not short-circuit

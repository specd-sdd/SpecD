# Verification: Port Http Transport

## Requirements

### Requirement: transport normalizes API base URL and /v1 prefix

#### Scenario: Trailing slash is trimmed from base URL

- **GIVEN** profile base `http://host/api/`
- **WHEN** transport builds request URL
- **THEN** request targets `http://host/api/v1/...`
- **AND** no double slashes

#### Scenario: Relative paths gain /v1 prefix

- **WHEN** port calls `getProject()`
- **THEN** fetch URL starts with `/v1/project`
- **AND** legacy unprefixed paths are not used

#### Scenario: Absolute paths in tests are rejected

- **WHEN** caller passes full URL without base merge
- **THEN** transport still applies base rules
- **AND** validation error is thrown

### Requirement: transport sets JSON accept and allows auth injection

#### Scenario: Accept application/json on every request

- **WHEN** transport issues fetch
- **THEN** `Accept: application/json` header set
- **AND** problem+json responses parse

#### Scenario: Auth injector adds Authorization when configured

- **GIVEN** profile stores bearer token
- **WHEN** transport wraps fetch
- **THEN** `Authorization: Bearer …` attached
- **AND** injector does not validate token

#### Scenario: No Authorization when profile has no token

- **GIVEN** embedded same-origin profile
- **WHEN** request is sent
- **THEN** Authorization header absent
- **AND** call still succeeds against disabled auth

### Requirement: transport supports AbortSignal cancellation

#### Scenario: Aborted fetch rejects hook promise

- **WHEN** hook unmount aborts in-flight request
- **THEN** `AbortError` propagated
- **AND** loading state clears

#### Scenario: Completed request ignores late abort

- **GIVEN** response already received
- **WHEN** abort signal fires
- **THEN** resolved data kept
- **AND** no spurious error state

#### Scenario: Global poll passes shared abort controller

- **WHEN** new poll tick aborts previous fetch
- **THEN** only latest tick updates UI
- **AND** stale responses discarded

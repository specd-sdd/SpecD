# Verification: Middleware Cors

## Requirements

### Requirement: allowed origins are configurable

#### Scenario: Configured origin receives ACAO header

- **GIVEN** `api.cors.origins` lists `https://studio.example`
- **WHEN** browser preflight from that origin
- **THEN** `Access-Control-Allow-Origin` echoes allowed origin
- **AND** disallowed origin is rejected

#### Scenario: Wildcard disabled when credentials enabled

- **GIVEN** credentials mode requires explicit origins
- **WHEN** server starts with credentials true
- **THEN** `*` is not emitted
- **AND** startup fails or config validation errors

#### Scenario: Omitted origin config uses safe default

- **WHEN** `specd serve` runs without cors origins in yaml
- **THEN** only same-origin or documented default applies
- **AND** behavior is stable across restarts

### Requirement: credentials mode is explicit

#### Scenario: Allow-Credentials set when enabled

- **GIVEN** `api.cors.credentials: true`
- **WHEN** allowed origin preflight succeeds
- **THEN** `Access-Control-Allow-Credentials: true`
- **AND** cookies may be sent cross-origin

#### Scenario: Credentials false omits allow-credentials

- **GIVEN** credentials disabled in config
- **WHEN** CORS preflight runs
- **THEN** Allow-Credentials header absent
- **AND** anonymous cross-origin reads still work

#### Scenario: Browser blocked request surfaces clear failure

- **WHEN** UI calls API from disallowed origin with credentials
- **THEN** browser blocks response
- **AND** Studio connect panel shows CORS hint

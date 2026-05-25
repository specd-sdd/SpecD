# Verification: Http Server Static Ui

## Requirements

### Requirement: static assets are served from configured dist path

#### Scenario: JS bundle served from ui-dist

- **GIVEN** `ui-dist` points at built Studio assets
- **WHEN** browser requests `/assets/index.js`
- **THEN** HTTP 200
- **AND** Content-Type matches file extension

#### Scenario: Missing asset returns 404

- **WHEN** browser requests unknown static path
- **THEN** HTTP 404
- **AND** not HTML error page from API router

#### Scenario: Custom ui-dist flag overrides default

- **WHEN** `specd ui serve --ui-dist ./custom` runs
- **THEN** files are read from custom directory
- **AND** default package dist is not used

### Requirement: SPA fallback returns index.html

#### Scenario: Unknown path serves index.html

- **WHEN** browser requests `/changes/foo` from static host
- **THEN** HTTP 200
- **AND** body is SPA `index.html`

#### Scenario: Existing static file bypasses fallback

- **WHEN** browser requests real asset under `/assets/`
- **THEN** actual file bytes returned
- **AND** index.html is not substituted

#### Scenario: API paths are not captured by SPA fallback

- **WHEN** client requests `/v1/project`
- **THEN** JSON API response
- **AND** not `index.html`

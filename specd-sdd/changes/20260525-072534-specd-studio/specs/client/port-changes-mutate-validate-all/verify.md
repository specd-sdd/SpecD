# Verification: validateChangeAll port

## Requirements

### Requirement: validateChangeAll on SpecdDataPort

#### Scenario: Remote adapter POST path

- **WHEN** `adapter-remote-specd-data.validateChangeAll('feat', { artifactId: 'tasks' })` runs
- **THEN** transport issues `POST /v1/changes/feat/validate-all` with body `{ "artifactId": "tasks" }`

#### Scenario: validateChange stays single-step

- **WHEN** `validateChange` is called with `{ specId, artifactId }`
- **THEN** transport issues `POST /v1/changes/{name}/validate` only

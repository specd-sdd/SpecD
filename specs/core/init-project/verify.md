# Verification: InitProject

## Requirements

### Requirement: Accepts InitProjectOptions as input

#### Scenario: All required fields provided

- **WHEN** `execute` is called with `projectRoot`, `schemaRef`, `workspaceId`, and `specsPath`
- **THEN** the call succeeds and the options are forwarded to `ConfigWriter.initProject`

### Requirement: Returns InitProjectResult on success

#### Scenario: Successful initialisation returns result

- **WHEN** `execute` is called with valid options and no existing config
- **THEN** the returned object contains `configPath`, `schemaRef`, and `workspaces`
- **AND** `configPath` is an absolute path ending in `specd.yaml`
- **AND** `workspaces` includes the provided `workspaceId`

### Requirement: Delegates entirely to ConfigWriter

#### Scenario: Port receives the input verbatim

- **WHEN** `execute` is called with an `InitProjectOptions` object
- **THEN** `ConfigWriter.initProject` is called exactly once with the same options object
- **AND** the use case performs no other I/O

### Requirement: Throws AlreadyInitialisedError when config exists

#### Scenario: Config already exists without force flag

- **GIVEN** `specd.yaml` already exists at `projectRoot`
- **WHEN** `execute` is called with `force` absent or `false`
- **THEN** an `AlreadyInitialisedError` is thrown

#### Scenario: Config already exists with force flag

- **GIVEN** `specd.yaml` already exists at `projectRoot`
- **WHEN** `execute` is called with `force: true`
- **THEN** the existing config is overwritten and a successful result is returned

### Requirement: Side effects performed by the port

#### Scenario: Storage directories created

- **WHEN** `execute` completes successfully
- **THEN** the `changes/`, `drafts/`, `discarded/`, and `archive/` directories exist under the storage path

#### Scenario: Gitignore entries added

- **WHEN** `execute` completes successfully
- **THEN** `specd.local.yaml` is listed in the project's `.gitignore`
- **AND** a `.gitignore` inside the archive directory excludes `.specd-index.jsonl`

# Verification: Change Create

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change create` is run without a positional name
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: No --spec flag creates change with empty specIds

- **WHEN** `specd change create my-change` is run with no `--spec` flag
- **THEN** the change is created with an empty specIds list
- **AND** stdout contains `created change my-change`
- **AND** the process exits with code 0

### Requirement: Workspace resolution

#### Scenario: Workspace prefix omitted defaults to default

- **WHEN** `specd change create my-change --spec auth/login` is run with no workspace prefix
- **THEN** the spec is treated as `default:auth/login`
- **AND** the change is created with workspace `default`

#### Scenario: Explicit workspace prefix used

- **GIVEN** `specd.yaml` declares a workspace named `billing-ws`
- **WHEN** `specd change create my-change --spec billing-ws:invoices` is run
- **THEN** the change is created with workspace `billing-ws` and specId `billing-ws:invoices`

#### Scenario: Unknown workspace prefix

- **WHEN** `specd change create my-change --spec nonexistent-ws:some/path` is run
- **THEN** the command exits with code 1 and prints an `error:` message to stderr

### Requirement: Output on success

#### Scenario: Successful creation

- **WHEN** `specd change create add-login --spec auth/login` succeeds
- **THEN** stdout contains exactly `created change add-login`
- **AND** stderr is empty
- **AND** the process exits with code 0

### Requirement: JSON output includes changePath

#### Scenario: JSON output contains changePath

- **WHEN** `specd change create my-change --format json` succeeds
- **THEN** the JSON output includes `changePath` as an absolute path string
- **AND** the path points to the change directory under `.specd/changes/`

### Requirement: Duplicate name error

#### Scenario: Name already exists

- **GIVEN** a change named `my-change` already exists
- **WHEN** `specd change create my-change --spec auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message mentioning the duplicate name

### Requirement: Output on success

#### Scenario: JSON output on success

- **WHEN** `specd change create add-login --spec auth/login --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"` and `state` equal to `"drafting"`
- **AND** `name` is `"add-login"`
- **AND** the process exits with code 0

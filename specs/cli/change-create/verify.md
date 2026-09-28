# Verification: Change Create

## Requirements

### Requirement: Command signature

Scenarios:

#### Scenario: Invalid policy flag fails before creation

- **WHEN** an unsupported artifact or workflow policy value is passed
- **THEN** the command exits with input guidance and creates no change

#### Scenario: Canonical signature accepts independent policy flags

- **WHEN** valid artifact and workflow flags accompany normal creation options
- **THEN** the command delegates creation with the resolved structured policy

### Requirement: Structured invalidation policy input

#### Scenario: CLI delegates resolved dimensions

- **WHEN** only `--workflow-policy redesign` is supplied
- **THEN** the CLI combines it with the configured or default artifact policy
- **AND** delegates `{ artifacts: downstream, workflow: redesign }` when neither project dimension is configured

#### Scenario: Both explicit dimensions are preserved

- **WHEN** `--artifact-policy surgical` and `--workflow-policy preserve` are supplied together
- **THEN** the CLI delegates exactly `{ artifacts: surgical, workflow: preserve }`
- **AND** it does not expose the deprecated scalar for new writes

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

### Requirement: ReadOnly workspace rejection

#### Scenario: Spec targeting readOnly workspace rejected

- **GIVEN** workspace `platform` is declared with `ownership: readOnly` in `specd.yaml`
- **WHEN** `specd change create my-change --spec platform:auth/tokens` is run
- **THEN** the command exits with code 1
- **AND** stderr contains `Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.`
- **AND** no change is created

#### Scenario: Multiple readOnly specs each produce an error

- **GIVEN** workspace `platform` is `readOnly`
- **WHEN** `specd change create my-change --spec platform:auth/tokens --spec platform:auth/sessions` is run
- **THEN** stderr contains one error message per readOnly spec
- **AND** no change is created

#### Scenario: Mixed owned and readOnly specs rejected

- **GIVEN** workspace `default` is `owned` and workspace `platform` is `readOnly`
- **WHEN** `specd change create my-change --spec default:auth/login --spec platform:auth/tokens` is run
- **THEN** the command exits with code 1 due to the readOnly spec
- **AND** no change is created

#### Scenario: Owned workspace specs accepted normally

- **GIVEN** workspace `default` is `owned`
- **WHEN** `specd change create my-change --spec default:auth/login` is run
- **THEN** the change is created successfully

### Requirement: Schema name and version

#### Scenario: Schema resolved inside CreateChange

- **GIVEN** the active project schema resolves to name `'spec-driven'` and version `1`
- **WHEN** `specd change create my-change` is run
- **THEN** `getActiveSchema` is not called in the CLI handler
- **AND** the created change's manifest includes `schemaName: 'spec-driven'` and `schemaVersion: 1`

#### Scenario: Manifest still records effective schema identity

- **GIVEN** the active project schema resolves to name `'spec-driven'` and version `1`
- **WHEN** `specd change create my-change` is run
- **THEN** the created change's manifest includes `schemaName: 'spec-driven'` and `schemaVersion: 1`

### Requirement: Overlap warning delegation

#### Scenario: CLI passes includeOverlapCheck when specs present

- **GIVEN** `specd change create my-change --spec default:auth/login` is run
- **WHEN** the CLI invokes `CreateChange.execute`
- **THEN** the input includes `includeOverlapCheck: true`

#### Scenario: Overlap warning emitted from result report

- **GIVEN** another active change already targets `default:auth/login`
- **WHEN** `specd change create my-change --spec default:auth/login` succeeds
- **THEN** stderr contains `warning: spec overlap detected`
- **AND** the process exits with code 0

#### Scenario: CLI does not call detectOverlap directly

- **WHEN** `specd change create my-change --spec default:auth/login` is run
- **THEN** the CLI handler does not invoke `kernel.changes.detectOverlap.execute`

#### Scenario: No overlap check when specIds empty

- **WHEN** `specd change create my-change` is run with no `--spec` flags
- **THEN** `includeOverlapCheck` is not passed as `true`

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

### Requirement: JSON output on success

#### Scenario: JSON output on success

- **WHEN** `specd change create add-login --spec auth/login --format json` succeeds
- **THEN** stdout is valid JSON with `result` equal to `"ok"` and `state` equal to `"drafting"`
- **AND** `name` is `"add-login"`
- **AND** the process exits with code 0

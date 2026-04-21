# Verification: Project Init

## Requirements

### Requirement: Command signature

#### Scenario: --plugin flag

- **WHEN** `specd project init --plugin @specd/plugin-agent-claude` is invoked
- **THEN** the plugin is selected for installation

### Requirement: Interactive mode

#### Scenario: Plugin selection wizard

- **GIVEN** interactive mode is active
- **WHEN** the user selects plugins
- **THEN** selected plugins are marked for installation

### Requirement: Known plugin options

#### Scenario: Wizard includes Open Code in known options

- **GIVEN** interactive mode is active
- **WHEN** the plugin selection options are rendered
- **THEN** `@specd/plugin-agent-opencode` is listed as a selectable plugin option

### Requirement: Non-interactive mode

#### Scenario: Default values produce a valid minimal config

- **WHEN** `specd project init --workspace default --workspace-path specs/` is run
- **THEN** `specd.yaml` is written with `schema: '@specd/schema-std'`, workspace `default` at `specs/`
- **AND** the process exits with code 0

#### Scenario: JSON output contains all fields including skillsInstalled

- **WHEN** `specd project init --format json --agent claude` is run
- **THEN** stdout is valid JSON with `result`, `configPath`, `schema`, `workspaces`, and `skillsInstalled` fields

### Requirement: Config file placement

#### Scenario: Config written to git root when inside a subdirectory

- **GIVEN** a git repository with root at `/repo` and the CWD is `/repo/packages/foo`
- **WHEN** `specd project init --workspace default` is run
- **THEN** `specd.yaml` is written to `/repo/specd.yaml`

#### Scenario: Config written to CWD when not inside a git repository

- **GIVEN** a directory that is not inside any git repository
- **WHEN** `specd project init --workspace default` is run
- **THEN** `specd.yaml` is written in the current working directory

### Requirement: Delegation to InitProject

#### Scenario: Standard directories are created

- **GIVEN** a project root with no pre-existing change directories
- **WHEN** `specd project init --workspace default` completes successfully
- **THEN** `changes/`, `drafts/`, `discarded/`, and `archive/` directories exist under the project root

#### Scenario: .gitignore entry is added

- **GIVEN** no `.gitignore` exists in the project root
- **WHEN** `specd project init --workspace default` completes successfully
- **THEN** a `.gitignore` is created containing `specd.local.yaml`

### Requirement: Skills installation after init

#### Scenario: Plugins are installed for selected plugins after init

- **WHEN** `specd project init --plugin @specd/plugin-agent-claude` is run
- **THEN** each plugin's `install()` method is called
- **AND** `specd.yaml` records the plugin under `plugins.agents`

### Requirement: Already initialised

#### Scenario: Non-interactive mode fails without --force

- **GIVEN** a `specd.yaml` already exists at the target path
- **WHEN** `specd project init --workspace default` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
- **AND** the existing `specd.yaml` is unchanged

#### Scenario: --force overwrites existing config

- **GIVEN** a `specd.yaml` with `schema: '@specd/schema-old'` exists
- **WHEN** `specd project init --force --schema @specd/schema-std --workspace default` is run
- **THEN** the command exits with code 0
- **AND** `specd.yaml` now contains the new schema reference

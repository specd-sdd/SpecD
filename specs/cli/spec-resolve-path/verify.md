# Verification: Spec Resolve Path

## Requirements

### Requirement: Command signature

#### Scenario: Missing path argument

- **WHEN** `specd spec resolve-path` is run without a path
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Path resolution

#### Scenario: Relative path resolved from cwd

- **GIVEN** cwd is `/project` and workspace `core` has `specsPath: /project/specs/core` with `prefix: core`
- **WHEN** `specd spec resolve-path specs/core/change` is run
- **THEN** stdout prints `core:core/change`

#### Scenario: Absolute path resolved directly

- **GIVEN** workspace `core` has `specsPath: /project/specs/core` with `prefix: core`
- **WHEN** `specd spec resolve-path /project/specs/core/change` is run
- **THEN** stdout prints `core:core/change`

#### Scenario: File path uses parent directory

- **GIVEN** workspace `default` has `specsPath: /project/specs` with no prefix
- **WHEN** `specd spec resolve-path /project/specs/auth/login/spec.md` is run
- **THEN** stdout prints `default:auth/login`

#### Scenario: Workspace without prefix produces bare path

- **GIVEN** workspace `default` has `specsPath: /project/specs` with no prefix
- **WHEN** `specd spec resolve-path /project/specs/auth/login` is run
- **THEN** stdout prints `default:auth/login`

#### Scenario: Multiple workspaces picks most specific

- **GIVEN** workspace `default` has `specsPath: /project/specs` and workspace `core` has `specsPath: /project/specs/core` with `prefix: core`
- **WHEN** `specd spec resolve-path /project/specs/core/change` is run
- **THEN** stdout prints `core:core/change`
- **AND** the `default` workspace is not used despite also matching

### Requirement: Output format

#### Scenario: Text output

- **GIVEN** workspace `core` has `specsPath: /project/specs/core` with `prefix: core`
- **WHEN** `specd spec resolve-path /project/specs/core/change` is run
- **THEN** stdout prints exactly `core:core/change` followed by a newline

#### Scenario: JSON output structure

- **GIVEN** workspace `core` has `specsPath: /project/specs/core` with `prefix: core`
- **WHEN** `specd spec resolve-path /project/specs/core/change --format json` is run
- **THEN** stdout is a valid JSON object with `workspace` equal to `"core"`, `specPath` equal to `"core/change"`, and `specId` equal to `"core:core/change"`

### Requirement: Error cases

#### Scenario: Path does not exist on disk

- **WHEN** `specd spec resolve-path /nonexistent/path` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message indicating the path does not exist

#### Scenario: Path not under any workspace

- **GIVEN** workspace `default` has `specsPath: /project/specs`
- **WHEN** `specd spec resolve-path /other/unrelated/path` is run and the path exists on disk
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message indicating the path does not fall under any configured workspace
